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
exports.sendDirectMessage = exports.repostPost = exports.likePost = exports.postReply = exports.getBlueskyAgent = void 0;
const api_1 = require("@atproto/api");
const dotenv_1 = __importDefault(require("dotenv"));
const redis_1 = require("./redis");
const logger_1 = require("./logger");
dotenv_1.default.config();
const { BLUESKY_HANDLE, BLUESKY_APP_PASSWORD } = process.env;
if (!BLUESKY_HANDLE || !BLUESKY_APP_PASSWORD) {
    throw new Error('Missing Bluesky credentials in environment variables');
}
const agent = new api_1.BskyAgent({
    service: 'https://bsky.social',
});
let _isLoggedIn = false;
const ensureAuthenticated = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Check if we have a valid session by making a test request
        if (_isLoggedIn) {
            try {
                yield agent.getProfile({ actor: BLUESKY_HANDLE });
                return; // Session is still valid
            }
            catch (error) {
                // If we get a 401 or authentication error, we need to re-login
                if (error.status === 401 || error.error === 'AuthenticationRequired') {
                    logger_1.logger.warn('Session expired, re-authenticating...');
                    _isLoggedIn = false;
                }
                else {
                    throw error; // Re-throw other errors
                }
            }
        }
        // Login with proper handle format
        const identifier = BLUESKY_HANDLE.includes('.') ? BLUESKY_HANDLE : `${BLUESKY_HANDLE}.bsky.social`;
        yield agent.login({
            identifier,
            password: BLUESKY_APP_PASSWORD,
        });
        _isLoggedIn = true;
        logger_1.logger.info(`Successfully logged into Bluesky as ${identifier}`);
    }
    catch (error) {
        _isLoggedIn = false;
        if (error.status === 401 || error.error === 'AuthenticationRequired') {
            throw new Error(`Invalid Bluesky credentials. Please check your BLUESKY_HANDLE (should be like 'username.bsky.social') and BLUESKY_APP_PASSWORD`);
        }
        throw error;
    }
});
const getBlueskyAgent = () => __awaiter(void 0, void 0, void 0, function* () {
    yield ensureAuthenticated();
    return agent;
});
exports.getBlueskyAgent = getBlueskyAgent;
const postReply = (text, parentUri) => __awaiter(void 0, void 0, void 0, function* () {
    const agent = yield (0, exports.getBlueskyAgent)();
    const parentState = yield (0, redis_1.getConversationState)(parentUri);
    if (!parentState) {
        throw new Error(`Could not find conversation state for parent post: ${parentUri}`);
    }
    const rootUri = parentState.rootUri;
    const rootState = yield (0, redis_1.getConversationState)(rootUri);
    if (!rootState) {
        // If the root post is not in our state, it might be the parent itself
        if (rootUri === parentUri) {
            // In this case, rootState is parentState
        }
        else {
            throw new Error(`Could not find conversation state for root post: ${rootUri}`);
        }
    }
    try {
        const response = yield agent.post({
            text: text,
            reply: {
                root: {
                    uri: rootUri,
                    cid: rootState ? rootState.cid : parentState.cid,
                },
                parent: {
                    uri: parentUri,
                    cid: parentState.cid,
                }
            },
            createdAt: new Date().toISOString()
        });
        logger_1.logger.info('Successfully posted reply to Bluesky:', response);
        return response;
    }
    catch (error) {
        logger_1.logger.error('Failed to post reply to Bluesky:', error);
        throw new Error('Failed to post reply to Bluesky');
    }
});
exports.postReply = postReply;
const likePost = (uri, cid) => __awaiter(void 0, void 0, void 0, function* () {
    const agent = yield (0, exports.getBlueskyAgent)();
    try {
        const response = yield agent.like(uri, cid);
        logger_1.logger.info('Successfully liked post:', response);
        return response;
    }
    catch (error) {
        logger_1.logger.error('Failed to like post:', error);
        throw new Error('Failed to like post');
    }
});
exports.likePost = likePost;
const repostPost = (uri, cid) => __awaiter(void 0, void 0, void 0, function* () {
    const agent = yield (0, exports.getBlueskyAgent)();
    try {
        const response = yield agent.repost(uri, cid);
        logger_1.logger.info('Successfully reposted post:', response);
        return response;
    }
    catch (error) {
        logger_1.logger.error('Failed to repost post:', error);
        throw new Error('Failed to repost post');
    }
});
exports.repostPost = repostPost;
const sendDirectMessage = (text, recipientDid) => __awaiter(void 0, void 0, void 0, function* () {
    const { execSync } = require('child_process');
    const path = require('path');
    try {
        // Path to the Python script
        const pythonScript = path.join(__dirname, 'bluesky_dm.py');
        // Execute the Python script with recipient DID and message text as arguments
        const result = execSync(`python "${pythonScript}" "${recipientDid}" "${text}"`, {
            encoding: 'utf8',
            env: Object.assign({}, process.env), // Pass all environment variables
            timeout: 30000 // 30 second timeout
        });
        // Parse the JSON response from Python
        const response = JSON.parse(result.trim());
        if (response.success) {
            logger_1.logger.info('Successfully sent direct message to Bluesky via Python:', response);
            return response;
        }
        else {
            logger_1.logger.error('Python DM script failed:', response.error);
            throw new Error(`Python DM script failed: ${response.error}`);
        }
    }
    catch (error) {
        logger_1.logger.error('Failed to execute Python DM script:', error);
        throw new Error('Failed to send direct message to Bluesky');
    }
});
exports.sendDirectMessage = sendDirectMessage;
