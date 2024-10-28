// Asynchronous JavaScript client for Russound RIO.

import { EventEmitter } from 'events';
import { setTimeout as delay } from 'timers-promises';
import { 
    FLAGS_BY_VERSION,
    MAX_SOURCE,
    MINIMUM_API_SUPPORT,
    FeatureFlag,
    MAX_RNET_CONTROLLERS,
    RESPONSE_REGEX,
    KEEP_ALIVE_INTERVAL,
    TIMEOUT,
 } from './const.js';


import {
    RussoundMessage,
    CallbackType,
    Source,
    Zone,
    MessageType,
} from './models.js'

import * as util from './util.js'

import {
    CommandError,
    UnsupportedFeatureError,
    RussoundError
} from './exceptions.js'

export class RussoundClient extends EventEmitter {
    constructor(connectionHandler) {
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
    }

    async registerStateUpdateCallbacks(callback) {
        this._stateUpdateCallbacks.push(callback);
        if (this._doStateUpdate) {
            await callback(this, CallbackType.STATE);
        }
    }

    unregisterStateUpdateCallbacks(callback) {
        this._stateUpdateCallbacks = this._stateUpdateCallbacks.filter(cb => cb !== callback);
    }

    clearStateUpdateCallbacks() {
        this._stateUpdateCallbacks = [];
    }

    async doStateUpdateCallbacks(callbackType = CallbackType.STATE) {
        if (!this._stateUpdateCallbacks.length) return;
        const callbacks = this._stateUpdateCallbacks.map(callback => callback(this, callbackType));
        await Promise.all(callbacks);
    }

    async request(cmd) {
        console.debug(`Sending command '${cmd}' to Russound client`);
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

    async connect() {
        if (!this.isConnected()) {
            this.connectResult = new Promise((resolve, reject) => {
                this._reconnectTask = this._reconnectHandler(resolve, reject);
            });
        }
        return this.connectResult;
    }

    async disconnect() {
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

    isConnected() {
        return this.connectTask !== null && !this.connectTask.done;
    }

    async _reconnectHandler(resolve, reject) {
        let reconnectDelay = 0.5;
        while (true) {
            try {
                this.connectTask = this._connectHandler(resolve, reject);
                await this.connectTask;
            } catch (ex) {
                console.error(ex);
            }
            await this.doStateUpdateCallbacks(CallbackType.CONNECTION);
            if (!this._attemptReconnection) {
                console.debug("Failed to connect to device on initial pass, skipping reconnect.");
                break;
            }
            reconnectDelay = Math.min(reconnectDelay * 2, 30);
            console.debug(`Attempting reconnection to Russound device in ${reconnectDelay} seconds...`);
            await delay(reconnectDelay * 1000);
        }
    }

    async _connectHandler(resolve, reject) {
        const handlerTasks = new Set();
        try {
            this._doStateUpdate = false;
            await this.connectionHandler.connect();
            handlerTasks.add(this.consumerHandler(this.connectionHandler));
            this.rioVersion = await this.request("VERSION");
            if (!util.isFwVersionHigher(this.rioVersion, MINIMUM_API_SUPPORT)) {
                throw new UnsupportedFeatureError(`Russound RIO API v${this.rioVersion} is not supported. The minimum supported version is v${MINIMUM_API_SUPPORT}`);
            }
            console.info(`Connected (Russound RIO v${this.rioVersion})`);
            const parentController = await this._loadController(1);
            if (!parentController) {
                throw new RussoundError("No primary controller found.");
            }
            this.controllers[1] = parentController;
            if (util.isRnetCapable(parentController.controllerType)) {
                for (let controllerId = 2; controllerId <= MAX_RNET_CONTROLLERS; controllerId++) {
                    const controller = await this._loadController(controllerId);
                    if (controller) {
                        this.controllers[controllerId] = controller;
                    }
                }
            }
            const subscribeStateUpdates = new Set([
                this.subscribe(this._asyncHandleSystem, "System")
            ]);
            for (let sourceId = 1; sourceId < MAX_SOURCE; sourceId++) {
                try {
                    const deviceStr = util.sourceDeviceStr(sourceId);
                    const name = await this.getVariable(deviceStr, "name");
                    if (name) {
                        subscribeStateUpdates.add(this.subscribe(this._asyncHandleSource, deviceStr));
                    }
                } catch (e) {
                    break;
                }
            }
            for (const [controllerId, controller] of Object.entries(this.controllers)) {
                for (let zoneId = 1; zoneId <= util.getMaxZones(controller.controllerType); zoneId++) {
                    try {
                        const deviceStr = util.zoneDeviceStr(controllerId, zoneId);
                        const name = await this.getVariable(deviceStr, "name");
                        if (name) {
                            subscribeStateUpdates.add(this.subscribe(this._asyncHandleZone, deviceStr));
                        }
                    } catch (e) {
                        break;
                    }
                }
            }
            const subscribeTasks = Array.from(subscribeStateUpdates);
            await Promise.all(subscribeTasks);
            this._doStateUpdate = true;
            await this.doStateUpdateCallbacks(CallbackType.CONNECTION);
            await delay(200);
            this._attemptReconnection = true;
            if (!resolve.done) {
                resolve(true);
            }
            handlerTasks.add(this._keepAlive());
            await Promise.race(handlerTasks);
        } catch (ex) {
            if (!resolve.done) {
                reject(ex);
            }
            console.error(ex);
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

    static processResponse(response) {
        try {
            const trimmedResponse = response.trim();
            if (trimmedResponse.length === 1 && trimmedResponse[0] === "S") {
                return new RussoundMessage(MessageType.STATE, null, null, null);
            }
            const [tag, payload] = [trimmedResponse[0], trimmedResponse.slice(2)];

            if (tag === "E") {
                console.debug(`Device responded with error: ${payload}`);
                return new RussoundMessage(tag, null, null, payload);
            }
            const m = RESPONSE_REGEX.exec(payload);
            if (!m) {
                return new RussoundMessage(tag, null, null, null);
            }
            return new RussoundMessage(tag, m[1] || null, m[2], m[3]);
        } catch (e) {
            console.warn(`Failed to decode Russound response ${trimmedResponse}`, e);
            return null;
        }
    }

    async consumerHandler(handler) {
        try {
            for await (const rawMsg of handler.reader) {
                var strResponse = new TextDecoder('iso-8859-1').decode(rawMsg);
                this._incompleteData = this?._incompleteData ?? ''
                if ( this._incompleteData != '')
                {
                    console.log("Incomplete Data", this._incompleteData)
                    strResponse = this._incompleteData + strResponse;
                    this._incompleteData = null;
                }
                const responses = strResponse.split('\r\n');

                if (!strResponse.toString().endsWith('\r\n')) {
                    this._incompleteData = responses.pop();
                    console.warn(`Incomplete data detected '${this._incompleteData}'`);
                }

                for (const response of responses)
                {
                    const msg = RussoundClient.processResponse(response);
                    if (msg) {
                        console.debug('recv (%j)', msg);
                        if (msg.type === "S" && this._futures.length) {
                            const { resolve } = this._futures.shift();
                            resolve(msg.value);
                        } else if (msg.type === "E" && this._futures.length) {
                            const { reject } = this._futures.shift();
                            reject(new CommandError());
                        }
                        if (msg.branch && msg.leaf && msg.type === "N") {
                            util.mapRioToDict(this.state, msg.branch, msg.leaf, msg.value);
                            const subscription = this._subscriptions[msg.branch];
                            if (subscription) {
                                await subscription(this);
                            }
                        }
                    }
                };
            }
        } catch (e) {
            if (e.name !== 'CanceledError') throw e;
        }
    }

    async _keepAlive() {
        while (true) {
            await delay(KEEP_ALIVE_INTERVAL);
            console.debug("Sending keep alive to device");
            try {
                await this.request("VERSION");
            } catch (e) {
                console.warn("Keep alive request to the Russound device timed out");
                break;
            }
        }
        console.debug("Ending keep alive task to attempt reconnection");
    }

    async subscribe(callback, branch) {
        this._subscriptions[branch] = callback;
        try {
            await this.request(`WATCH ${branch} ON`);
        } catch (e) {
            delete this._subscriptions[branch];
            throw e;
        }
    }

    async _asyncHandleSystem(controller) {
        if (controller._doStateUpdate) {
            await controller.doStateUpdateCallbacks();
        }
    }

    async _asyncHandleSource(controller) {
        for (const [sourceId, sourceData] of Object.entries(controller.state["S"])) {
            const source = new Source(sourceData);
            source.client = controller;
            controller.sources[sourceId] = source;
        }
        if (controller._doStateUpdate) {
            await controller.doStateUpdateCallbacks();
        }
    }

    async _asyncHandleZone(controller) {
        for (const [controllerId, controllerData] of Object.entries(controller.state["C"])) {
            for (const [zoneId, zoneData] of Object.entries(controllerData["Z"])) {
                const zone = new ZoneControlSurface(zoneData);
                zone.client = controller;
                zone.deviceStr = util.zoneDeviceStr(controllerId, zoneId);
                controller.controllers[controllerId].zones[zoneId] = zone;
            }
        }
        if (controller._doStateUpdate) {
            await controller.doStateUpdateCallbacks();
        }
    }

    async setVariable(deviceStr, key, value) {
        return this.request(`SET ${deviceStr}.${key}="${value}"`);
    }

    async getVariable(deviceStr, key) {
        return this.request(`GET ${deviceStr}.${key}`);
    }

    async _loadController(controllerId) {
        const deviceStr = util.controllerDeviceStr(controllerId);
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
            if (util.isFeatureSupported(this.rioVersion, FeatureFlag.PROPERTY_FIRMWARE_VERSION)) {
                firmwareVersion = await this.getVariable(deviceStr, "firmwareVersion");
            }
            const controller = new Controller(controllerId, controllerType, this, deviceStr, macAddress, firmwareVersion, {});
            return controller;
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    get supportedFeatures() {
        const flags = [];
        for (const [key, value] of Object.entries(FLAGS_BY_VERSION)) {
            if (util.isFwVersionHigher(this.rioVersion, key)) {
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

class ZoneControlSurface extends Zone {
    async sendEvent(eventName, ...args) {
        const argsStr = args.join(' ');
        const cmd = `EVENT ${this.deviceStr}!${eventName} ${argsStr}`;
        return this.client.request(cmd);
    }

    fetchCurrentSource() {
        const currentSource = parseInt(this.current_source, 10);
        return this.client.sources[currentSource];
    }

    async mute() {
        return this.sendEvent("ZoneMuteOn");
    }

    async unmute() {
        return this.sendEvent("ZoneMuteOff");
    }

    async setVolume(volume) {
        return this.sendEvent("KeyPress", "Volume", volume);
    }

    async volumeUp() {
        return this.sendEvent("KeyPress", "VolumeUp");
    }

    async volumeDown() {
        return this.sendEvent("KeyPress", "VolumeDown");
    }

    async previous() {
        return this.sendEvent("KeyPress", "Previous");
    }

    async next() {
        return this.sendEvent("KeyPress", "Next");
    }

    async stop() {
        return this.sendEvent("KeyPress", "Stop");
    }

    async pause() {
        return this.sendEvent("KeyPress", "Pause");
    }

    async play() {
        return this.sendEvent("KeyPress", "Play");
    }

    async zoneOn() {
        return this.sendEvent("ZoneOn");
    }

    async zoneOff() {
        return this.sendEvent("ZoneOff");
    }

    async selectSource(source) {
        return this.sendEvent("SelectSource", source);
    }
}

class Controller {
    constructor(controllerId, controllerType, client, deviceStr, macAddress, firmwareVersion, zones = {}) {
        this.controllerId = controllerId;
        this.controllerType = controllerType;
        this.client = client;
        this.deviceStr = deviceStr;
        this.macAddress = macAddress;
        this.firmwareVersion = firmwareVersion;
        this.zones = zones;
    }
}

