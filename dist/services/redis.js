"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConversationState = exports.setConversationState = exports.redis = void 0;
const redis_1 = require("@upstash/redis");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const { REDIS_URL, REDIS_TOKEN } = process.env;
if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error('Missing Redis credentials in environment variables');
}
exports.redis = new redis_1.Redis({
    url: REDIS_URL,
    token: REDIS_TOKEN,
});
const setConversationState = (postUri, state) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Validate the state object before storing
        if (!state || typeof state !== 'object') {
            throw new Error(`Invalid state object: ${typeof state}`);
        }
        if (!state.cid || !state.genesysConversationId || !state.rootUri) {
            console.warn(`Incomplete state object for ${postUri}:`, state);
        }
        const stateString = JSON.stringify(state);
        console.debug(`Storing state for ${postUri}:`, stateString);
        yield exports.redis.set(`bluesky:post:${postUri}`, stateString);
    }
    catch (error) {
        console.error(`Failed to store Redis data for key bluesky:post:${postUri}:`, error, 'State:', state);
        throw error;
    }
});
exports.setConversationState = setConversationState;
const getConversationState = (postUri) => __awaiter(void 0, void 0, void 0, function* () {
    const state = yield exports.redis.get(`bluesky:post:${postUri}`);
    if (state) {
        try {
            // Check if state is already a string or needs conversion
            const stateString = typeof state === 'string' ? state : JSON.stringify(state);
            // If the string is "[object Object]", it means the object was improperly converted
            if (stateString === '[object Object]') {
                console.error(`Corrupted Redis data for key bluesky:post:${postUri} - contains "[object Object]"`);
                return null;
            }
            return JSON.parse(stateString);
        }
        catch (error) {
            console.error(`Failed to parse Redis data for key bluesky:post:${postUri}:`, error, 'Raw value:', state);
            return null;
        }
    }
    return null;
});
exports.getConversationState = getConversationState;
