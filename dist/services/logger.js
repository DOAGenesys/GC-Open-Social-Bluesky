"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.LogLevel = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const { LOG_LEVEL } = process.env;
var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "debug";
    LogLevel["INFO"] = "info";
    LogLevel["WARN"] = "warn";
    LogLevel["ERROR"] = "error";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
const configuredLogLevel = LOG_LEVEL || LogLevel.INFO;
const logLevels = {
    [LogLevel.DEBUG]: 0,
    [LogLevel.INFO]: 1,
    [LogLevel.WARN]: 2,
    [LogLevel.ERROR]: 3,
};
const shouldLog = (level) => {
    return logLevels[level] >= logLevels[configuredLogLevel];
};
exports.logger = {
    debug: (message, ...args) => {
        if (shouldLog(LogLevel.DEBUG)) {
            console.debug(`[DEBUG] ${message}`, ...args);
        }
    },
    info: (message, ...args) => {
        if (shouldLog(LogLevel.INFO)) {
            console.info(`[INFO] ${message}`, ...args);
        }
    },
    warn: (message, ...args) => {
        if (shouldLog(LogLevel.WARN)) {
            console.warn(`[WARN] ${message}`, ...args);
        }
    },
    error: (message, ...args) => {
        if (shouldLog(LogLevel.ERROR)) {
            console.error(`[ERROR] ${message}`, ...args);
        }
    },
};
