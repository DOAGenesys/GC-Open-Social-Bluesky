import dotenv from 'dotenv';

dotenv.config();

const { LOG_LEVEL } = process.env;

export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
}

const configuredLogLevel = (LOG_LEVEL as LogLevel) || LogLevel.INFO;

const logLevels = {
    [LogLevel.DEBUG]: 0,
    [LogLevel.INFO]: 1,
    [LogLevel.WARN]: 2,
    [LogLevel.ERROR]: 3,
};

const shouldLog = (level: LogLevel) => {
    return logLevels[level] >= logLevels[configuredLogLevel];
}

export const logger = {
    debug: (message: string, ...args: any[]) => {
        if (shouldLog(LogLevel.DEBUG)) {
            console.debug(`[DEBUG] ${message}`, ...args);
        }
    },
    info: (message: string, ...args: any[]) => {
        if (shouldLog(LogLevel.INFO)) {
            console.info(`[INFO] ${message}`, ...args);
        }
    },
    warn: (message: string, ...args: any[]) => {
        if (shouldLog(LogLevel.WARN)) {
            console.warn(`[WARN] ${message}`, ...args);
        }
    },
    error: (message: string, ...args: any[]) => {
        if (shouldLog(LogLevel.ERROR)) {
            console.error(`[ERROR] ${message}`, ...args);
        }
    },
}; 