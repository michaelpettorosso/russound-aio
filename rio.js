// Asynchronous JavaScript client for Russound RIO.
const EventEmitter = require('events');
const TimerPromises = require('timers-promises');
const Constants = require('./const');
const Models = require('./models');
const Utils = require('./util');
const Exceptions = require('./exceptions');
const Logger = require('./logger');

class RussoundClient extends EventEmitter {
    constructor(connectionHandler, logger, config) {
        super();
        this.connectionHandler = connectionHandler;
        this._loop = null;
        this._subscriptions = {};
        this.connectResult = null;
        this.connectTask = null;
        this._reconnectTask = null;
        this._stateUpdateCallbacks = [];
        this.controllers = {};
        this.sources = {};
        this.rioVersion = null;
        this.state = {};
        this._futures = [];
        this._attemptReconnection = false;
        this._doStateUpdate = false;
        this.config = config;
        this.logger = logger;
        this.enableDebugMode = config ? config?.enableDebugMode ?? false : false;
        this.disableLogInfo = config?.disableLogInfo || false;
        if (!logger) 
            this.logger = new Logger(config ? this.enableDebugMode === true : false);
    }

    registerStateUpdateCallbacks = async (callback) => {
        this._stateUpdateCallbacks.push(callback);
        if (this._doStateUpdate) {
            await callback(this, Models.CallbackType.STATE);
        }
    }

    unregisterStateUpdateCallbacks = (callback) => {
        this._stateUpdateCallbacks = this._stateUpdateCallbacks.filter(cb => cb !== callback);
    }

    clearStateUpdateCallbacks = () => {
        this._stateUpdateCallbacks = [];
    }

    doStateUpdateCallbacks = async (callbackType = Models.CallbackType.STATE) => {
        if (!this._stateUpdateCallbacks.length) return;
        const callbacks = this._stateUpdateCallbacks.map(callback => callback(this, callbackType));
        await Promise.all(callbacks);
    }

    request = async (cmd) => {
        this.logDebug(`Sending command '${cmd}' to Russound client`);
        const future = new Promise((resolve, reject) => {
            this._futures.push({ resolve, reject });
        });
        try {
            await this.connectionHandler.send(cmd);
        } catch (ex) {
            const { resolve, reject } = this._futures.shift();
            reject(ex);
        }
        return future;
    }

    connect = async () => {
        if (!this.isConnected()) {
            this.connectResult = new Promise((resolve, reject) => {
                this._reconnectTask = this._reconnectHandler(resolve, reject);
            });
        }
        return this.connectResult;
    }

    disconnect = async () => {
        if (this.isConnected()) {
            this._attemptReconnection = false;
            //this.connectTask.cancel();
            try {
                await this.connectTask;
            } catch (e) {
                if (e.name !== 'CanceledError') throw e;
            }
        }
    }

    isConnected = () => {
        return this.connectTask !== null && !this.connectTask.done;
    }

    _reconnectHandler = async (resolve, reject) => {
        let reconnectDelay = 0.5;
        while (true) {
            try {
                this.connectTask = this._connectHandler(resolve, reject);
                await this.connectTask;
            } catch (ex) {
                this.logError(ex);
            }
            await this.doStateUpdateCallbacks(Models.CallbackType.CONNECTION);
            if (!this._attemptReconnection) {
                this.logDebug("Failed to connect to device on initial pass, skipping reconnect.");
                break;
            }
            reconnectDelay = Math.min(reconnectDelay * 2, 30);
            this.logDebug(`Attempting reconnection to Russound device in ${reconnectDelay} seconds...`);
            await TimerPromises.setTimeout(reconnectDelay * 1000);
        }
    }

    _connectHandler = async(resolve, reject) => {
        const handlerTasks = new Set();
        try {
            this._doStateUpdate = false;
            await this.connectionHandler.connect();
            handlerTasks.add(this.consumerHandler(this.connectionHandler));
            this.rioVersion = await this.request("VERSION");
            if (!Utils.isFwVersionHigher(this.rioVersion, Constants.MINIMUM_API_SUPPORT)) {
                throw new Models.UnsupportedFeatureError(`Russound RIO API v${this.rioVersion} is not supported. The minimum supported version is v${MINIMUM_API_SUPPORT}`);
            }
            this.logInfo(`Connected (Russound RIO v${this.rioVersion})`);
            const parentController = await this._loadController(1);
            if (!parentController) {
                throw new Exceptions.RussoundError("No primary controller found.");
            }
            this.controllers[1] = parentController;
            if (Utils.isRnetCapable(parentController.controllerType)) {
                for (let controllerId = 2; controllerId <= Constants.MAX_RNET_CONTROLLERS; controllerId++) {
                    const controller = await this._loadController(controllerId);
                    if (controller) {
                        this.controllers[controllerId] = controller;
                    }
                }
            }
            const subscribeStateUpdates = new Set([
                this.subscribe(this._asyncHandleSystem, "System")
            ]);
            for (let sourceId = 1; sourceId < Constants.MAX_SOURCE; sourceId++) {
                try {
                    const deviceStr = Utils.sourceDeviceStr(sourceId);
                    const name = await this.getVariable(deviceStr, "name");
                    if (name) {
                        subscribeStateUpdates.add(this.subscribe(this._asyncHandleSource, deviceStr));
                    }
                } catch (e) {
                    break;
                }
            }

            for (const [controllerId, controller] of Object.entries(this.controllers)) {
                for (let zoneId = 1; zoneId <= Utils.getMaxZones(controller.controllerType); zoneId++) {
                    try {
                        if (!this.config || (this.config.zones[`${zoneId}`]?.enabled ?? true === true))
                        {
                            this.logInfo(`Zone ${zoneId} Enabled`);

                            const deviceStr = Utils.zoneDeviceStr(controllerId, zoneId);
                            const name = await this.getVariable(deviceStr, "name");
                            if (name) {
                              subscribeStateUpdates.add(this.subscribe(this._asyncHandleZone, deviceStr));
                            }
                        }
                        else
                            this.logDebug(`Zone ${zoneId} Disabled`);
                    } catch (e) {
                        break;
                    }
                }
            }
            const subscribeTasks = Array.from(subscribeStateUpdates);
            await Promise.all(subscribeTasks);

            this._doStateUpdate = true;
            await this.doStateUpdateCallbacks(Models.CallbackType.CONNECTION);
            await TimerPromises.setTimeout(200);
            this._attemptReconnection = true;
            resolve(true);
            handlerTasks.add(this._keepAlive());
            await Promise.race(handlerTasks);
        } catch (ex) {
            this.logError(ex);
            reject(ex);
        } finally {
            for (const task of handlerTasks) {
                if (!task.done) {
                    //task.cancel();
                }
            }
            while (this._futures.length) {
                const { resolve, reject } = this._futures.shift();
                reject(new Error('Cancelled'));
            }
            this._doStateUpdate = false;
            const closeout = new Set(handlerTasks);
            if (closeout.size) {
                const closeoutTask = Promise.all(closeout);
                while (!closeoutTask.done) {
                    try {
                        await closeoutTask;
                    } catch (e) {
                        if (e.name !== 'CanceledError') throw e;
                    }
                }
            }
        }
    }

    static processResponse(response, logger) {
        try {
            const trimmedResponse = response.trim();
            if (trimmedResponse.length === 1 && trimmedResponse[0] === "S") {
                return new Models.RussoundMessage(Models.MessageType.STATE, null, null, null);
            }
            const [tag, payload] = [trimmedResponse[0], trimmedResponse.slice(2)];

            if (tag === "E") {
                logger?.debug(`Device responded with error: ${payload}`);
                return new Models.RussoundMessage(tag, null, null, payload);
            }
            const m = Constants.RESPONSE_REGEX.exec(payload);
            if (!m) {
                return new Models.RussoundMessage(tag, null, null, null);
            }
            return new Models.RussoundMessage(tag, m[1] || null, m[2], m[3]);
        } catch (e) {
            logger?.warn(`Failed to decode Russound response ${trimmedResponse}`, e);
            return null;
        }
    }

    consumerHandler = async (handler) => {
        try {
            for await (const rawMsg of handler.reader) {
                var strResponse = new TextDecoder('iso-8859-1').decode(rawMsg);
                this._incompleteData = this?._incompleteData ?? ''
                if ( this._incompleteData != '')
                {
                    this.logDebug("Incomplete Data", this._incompleteData)
                    strResponse = this._incompleteData + strResponse;
                    this._incompleteData = null;
                }
                const responses = strResponse.split('\r\n');

                if (!strResponse.toString().endsWith('\r\n')) {
                    this._incompleteData = responses.pop();
                    this.logWarn(`Incomplete data detected '${this._incompleteData}'`);
                }

                for (const response of responses)
                {
                    const msg = RussoundClient.processResponse(response, this.logger);
                    if (msg) {
                        this.logInfo(`Response: (%j)`, msg);
                        if (msg.type === "S" && this._futures.length) {
                            const { resolve } = this._futures.shift();
                            resolve(msg.value);
                        } else if (msg.type === "E" && this._futures.length) {
                            const { reject } = this._futures.shift();
                            reject(new Exceptions.CommandError());
                        }
                        if (msg.branch && msg.leaf && msg.type === "N") {
                            Utils.mapRioToDict(this.state, msg.branch, msg.leaf, msg.value);
                            const subscription = this._subscriptions[msg.branch];
                            if (subscription) {
                                await subscription();
                            }
                        }
                    }
                };
            }
        } catch (e) {
            if (e.name !== 'CanceledError') throw e;
        }
    }

    _keepAlive = async () => {
        while (true) {
            await TimerPromises.setTimeout(Constants.KEEP_ALIVE_INTERVAL);
            this.logDebug("Sending keep alive to device");
            try {
                await this.request("VERSION");
            } catch (e) {
                this.logWarn("Keep alive request to the Russound device timed out");
                break;
            }
        }
        this.logDebug("Ending keep alive task to attempt reconnection");
    }

    subscribe = async (callback, branch) => {
        this._subscriptions[branch] = callback;
        try {
            await this.request(`WATCH ${branch} ON`);
        } catch (e) {
            delete this._subscriptions[branch];
            throw e;
        }
    }

    _asyncHandleSystem = async () => {
        if (this._doStateUpdate) {
            await this.doStateUpdateCallbacks();
        }
    }

    _asyncHandleSource = async () => {
        for (const [sourceId, sourceData] of Object.entries(this.state["S"])) {
            const source = new Models.Source(sourceData);
            source.client = this;
            this.sources[sourceId] = source;
        }
        if (this._doStateUpdate) {
            await this.doStateUpdateCallbacks();
        }
    }

    _asyncHandleZone = async () => {
        for (const [controllerId, controllerData] of Object.entries(this.state["C"])) {
            for (const [zoneId, zoneData] of Object.entries(controllerData["Z"])) {
                const zone = new ZoneControlSurface(zoneData);
                zone.client = this;
                zone.deviceStr = Utils.zoneDeviceStr(controllerId, zoneId);
                this.controllers[controllerId].zones[zoneId] = zone;
            }
        }
        if (this._doStateUpdate) {
            await this.doStateUpdateCallbacks();
        }
    }

    setVariable = async (deviceStr, key, value) => {
        return this.request(`SET ${deviceStr}.${key}="${value}"`);
    }

    getVariable = async (deviceStr, key) => {
        return this.request(`GET ${deviceStr}.${key}`);
    }

    _loadController = async (controllerId) => {
        const deviceStr = Utils.controllerDeviceStr(controllerId);
        try {
            const controllerType = await this.getVariable(deviceStr, "type");
            if (!controllerType) return null;
            let macAddress = null;
            try {
                macAddress = await this.getVariable(deviceStr, "macAddress");
            } catch (e) {
                // Ignore CommandError
            }
            let firmwareVersion = null;
            if (Utils.isFeatureSupported(this.rioVersion, Constants.FeatureFlag.PROPERTY_FIRMWARE_VERSION)) {
                firmwareVersion = await this.getVariable(deviceStr, "firmwareVersion");
            }
            const controller = new Controller(controllerId, controllerType, this, deviceStr, macAddress, firmwareVersion, {});
            return controller;
        } catch (e) {
            this.logError(e);
            return null;
        }
    }

    logMessage = (message) => {
        var prefix = '';  
        if (this.logger instanceof Logger)
          prefix = `[${this.config ? this.config?.name : "" ?? "Russound AIO"}] `;
        return "[API] " + prefix + message;;
    }

    log = (message, ...args) => {
        if (this.logger)
            this.logger.log(this.logMessage(message), ...args);
        else
            console.log(this.logMessage(message), ...args)
    }

    logInfo = (message, ...args) => {
        if (!this.disableLogInfo)
        {
            if (this.logger)
                this.logger.info(this.logMessage(message), ...args);
            else
                console.log('[Info]' + this.logMessage(message), ...args)
        }
    }

    logDebug = (message, ...args) => {
        if (this.logger)
          if (this.enableDebugMode)
            this.logger.info(this.logMessage(message), ...args);
          else  
            this.logger.debug(this.logMessage(message), ...args);
        else
            console.log('[Debug]' + this.logMessage(message), ...args)
    }

    logWarn = (message, ...args) => {
        if (this.logger)
            this.logger.warn(this.logMessage(message), ...args);
        else
            console.log('[Warn]' + this.logMessage(message), ...args)
    }

    logError = (message, ...args) => {
        if (this.logger)
            this.logger.error(this.logMessage(message), ...args);
        else
            console.log('[Error]' + this.logMessage(message), ...args)
    }

    get supportedFeatures() {
        const flags = [];
        for (const [key, value] of Object.entries(FLAGS_BY_VERSION)) {
            if (Utils.isFwVersionHigher(this.rioVersion, key)) {
                flags.push(...value);
            }
        }
        return flags;
    }
}

class AbstractControlSurface {
    constructor() {
        this.client = null;
        this.deviceStr = null;
    }
}

class ZoneControlSurface extends Models.Zone {
    sendEvent = async (eventName, ...args) => {
        const argsStr = args.join(' ');
        const cmd = `EVENT ${this.deviceStr}!${eventName} ${argsStr}`;
        return this.client.request(cmd);
    }

    fetchCurrentSource = () => {
        const currentSource = parseInt(this.current_source, 10);
        return this.client.sources[currentSource];
    }

    keyRelease = async (command) => {
        return this.sendEvent("KeyRelease", command)
    }

    keyPress= async (...args) => {
        return this.sendEvent("KeyPress", ...args)
    }

    zoneMute = async () => {
        return this.sendEvent("ZoneMuteOn");
    }

    zoneUnmute = async () => {
        return this.sendEvent("ZoneMuteOff");
    }

    setVolume = async (volume) => {
        return this.keyPress("Volume", volume);
    }

    volumeUp = async () => {
        return this.keyPress("VolumeUp");
    }

    volumeDown = async () => {
        return this.keyPress("VolumeDown");
    }

    previous = async () => {
        return this.keyPress("Previous");
    }

    next = async () => {
        return this.keyPress("Next");
    }

    stop = async () => {
        return this.keyPress("Stop");
    }

    pause = async () => {
        return this.keyPress("Pause");
    }

    play = async () => {
        return this.keyPress("Play");
    }

    zoneOn = async () => {
        return this.sendEvent("ZoneOn");
    }

    zoneOff = async () => {
        return this.sendEvent("ZoneOff");
    }

    selectSource =  async (source) => {
        return this.sendEvent("SelectSource", source);
    }
}

class Controller {
    constructor(controllerId, controllerType, client, deviceStr, macAddress, firmwareVersion, zones = {}) {
        this.controllerId = controllerId;
        this.controllerType = controllerType;
        this.manufacturer = 'Russound';
        this.client = client;
        this.deviceStr = deviceStr;
        this.macAddress = macAddress;
        this.firmwareVersion = firmwareVersion;
        this.zones = zones;
    }
}

module.exports = RussoundClient
