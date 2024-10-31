const EventEmitter = require('events');
const Constants = require('./const');
const Logger = require('./logger');

class RussoundConnectionHandler extends EventEmitter {
    constructor() {
        super();
        this.reader = null;
        // this.connected = false;
    }

    async send(cmd) {
        /** Send a command to the Russound client. */
        // if (!this.connected) {
        //     throw new Error("Not connected to device.");
        // }
    }

    async connect() {
        throw new Error("Method 'connect()' must be implemented.");
    }
}

class RussoundTcpConnectionHandler extends RussoundConnectionHandler {
    constructor(host, port, logger, config) {
        super();
        this.host = host;
        this.port = port ?? Constants.DEFAULT_PORT;
        this.writer = null;
        this.config = config;
        this.logger = logger;
        if (!logger) 
            this.logger = new Logger(config ? config['enableDebugMode'] === true : false);
    }

    async connect() {
        this.logger.debug(`Connecting to ${this.host}:${this.port}`);

        const PromiseSocket = await import('promise-socket').then(ps => ps.default)

        const promiseSocket = new PromiseSocket();
        await promiseSocket.connect(this.port, this.host);

        // this.connected = true;

        const client = promiseSocket.socket; 
        this.writer = client;
        this.reader = client; // In Node.js, you can read from the socket directly

        client.on('data', (data) => {
            // Handle incoming data
            this.emit('data', data);
        });

        client.on('close', (err) => {
            this.logger.info('Connection close:', err);
            // this.connected = false;
        });

        client.on('error', (err) => {
            this.logger.error('Connection error:', err);
        });

    }

    async send(cmd) {
        /** Send a command to the Russound client. */
        await super.send(cmd);
        this.writer.write(`${cmd}\r`);
    }
}


module.exports = RussoundTcpConnectionHandler;
