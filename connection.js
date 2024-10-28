import { EventEmitter } from 'events';
import { DEFAULT_PORT } from './const.js'
import { PromiseSocket } from "promise-socket"

const _LOGGER = console; // Using console for logging

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

export class RussoundTcpConnectionHandler extends RussoundConnectionHandler {
    constructor(host, port = DEFAULT_PORT) {
        super();
        this.host = host;
        this.port = port;
        this.writer = null;
    }

    async connect() {
        _LOGGER.debug(`Connecting to ${this.host}:${this.port}`);
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
            _LOGGER.info('Connection close:', err);
            // this.connected = false;
        });

        client.on('error', (err) => {
            _LOGGER.error('Connection error:', err);
        });

    }

    async send(cmd) {
        /** Send a command to the Russound client. */
        await super.send(cmd);
        this.writer.write(`${cmd}\r`);
    }
}

