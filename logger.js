class Logger {
    _logDebug = false;

    constructor(debug = false) {
        this._logDebug = debug
    }

    log = (msg, ...optionalParams) => { console.log(msg, ...optionalParams) };
    info = (msg, ...optionalParams) => { console.info('[INFO]', msg, ...optionalParams) };
    debug = (msg, ...optionalParams) => { if (this._logDebug) console.log('[DEBUG]', msg, ...optionalParams) };
    warn = (msg, ...optionalParams) => { console.warn('[WARN]', msg, ...optionalParams) };
    error = (msg, ...optionalParams) => { console.error('[ERROR]', msg, ...optionalParams) };
}

module.exports = Logger;
