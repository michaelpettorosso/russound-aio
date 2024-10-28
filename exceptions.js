// Asynchronous JavaScript client for Russound RIO.

export class RussoundError extends Error {
    constructor(message) {
        super(message);
        this.name = "RussoundError";
    }
}

export class CommandError extends Error {
    constructor(message) {
        super(message);
        this.name = "CommandError";
    }
}

export class UncachedVariableError extends Error {
    constructor(message) {
        super(message);
        this.name = "UncachedVariableError";
    }
}

export class UnsupportedFeatureError extends Error {
    constructor(message) {
        super(message);
        this.name = "UnsupportedFeatureError";
    }
}

export class UnsupportedRussoundVersionError extends Error {
    constructor(message) {
        super(message);
        this.name = "UnsupportedRussoundVersionError";
    }
}

