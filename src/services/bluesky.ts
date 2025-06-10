import { BskyAgent } from '@atproto/api';
import dotenv from 'dotenv';
import { getConversationState } from './redis';
import { logger } from './logger';

dotenv.config();

const { BLUESKY_HANDLE, BLUESKY_APP_PASSWORD } = process.env;

if (!BLUESKY_HANDLE || !BLUESKY_APP_PASSWORD) {
  throw new Error('Missing Bluesky credentials in environment variables');
}

const agent = new BskyAgent({
  service: 'https://bsky.social',
});

let _isLoggedIn = false;

const ensureAuthenticated = async (): Promise<void> => {
  try {
    // Check if we have a valid session by making a test request
    if (_isLoggedIn) {
      try {
        await agent.getProfile({ actor: BLUESKY_HANDLE });
        return; // Session is still valid
      } catch (error: any) {
        // If we get a 401 or authentication error, we need to re-login
        if (error.status === 401 || error.error === 'AuthenticationRequired') {
          logger.warn('Session expired, re-authenticating...');
          _isLoggedIn = false;
        } else {
          throw error; // Re-throw other errors
        }
      }
    }

    // Login with proper handle format
    const identifier = BLUESKY_HANDLE.includes('.') ? BLUESKY_HANDLE : `${BLUESKY_HANDLE}.bsky.social`;
    
    await agent.login({
      identifier,
      password: BLUESKY_APP_PASSWORD,
    });
    
    _isLoggedIn = true;
    logger.info(`Successfully logged into Bluesky as ${identifier}`);
  } catch (error: any) {
    _isLoggedIn = false;
    if (error.status === 401 || error.error === 'AuthenticationRequired') {
      throw new Error(`Invalid Bluesky credentials. Please check your BLUESKY_HANDLE (should be like 'username.bsky.social') and BLUESKY_APP_PASSWORD`);
    }
    throw error;
  }
};

export const getBlueskyAgent = async (): Promise<BskyAgent> => {
  await ensureAuthenticated();
  return agent;
};

export const postReply = async (text: string, parentUri: string): Promise<any> => {
    const agent = await getBlueskyAgent();

    const parentState = await getConversationState(parentUri);
    if (!parentState) {
        throw new Error(`Could not find conversation state for parent post: ${parentUri}`);
    }

    const rootUri = parentState.rootUri;
    const rootState = await getConversationState(rootUri);
    if (!rootState) {
        // If the root post is not in our state, it might be the parent itself
        if (rootUri === parentUri) {
            // In this case, rootState is parentState
        } else {
            throw new Error(`Could not find conversation state for root post: ${rootUri}`);
        }
    }

    try {
        const response = await agent.post({
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
        logger.info('Successfully posted reply to Bluesky:', response);
        return response;
    } catch(error) {
        logger.error('Failed to post reply to Bluesky:', error);
        throw new Error('Failed to post reply to Bluesky');
    }
}

export const likePost = async (uri: string, cid: string): Promise<any> => {
    const agent = await getBlueskyAgent();
    try {
        const response = await agent.like(uri, cid);
        logger.info('Successfully liked post:', response);
        return response;
    } catch (error) {
        logger.error('Failed to like post:', error);
        throw new Error('Failed to like post');
    }
}

export const repostPost = async (uri: string, cid: string): Promise<any> => {
    const agent = await getBlueskyAgent();
    try {
        const response = await agent.repost(uri, cid);
        logger.info('Successfully reposted post:', response);
        return response;
    } catch (error) {
        logger.error('Failed to repost post:', error);
        throw new Error('Failed to repost post');
    }
}

export const sendDirectMessage = async (text: string, recipientDid: string): Promise<any> => {
    const { execSync } = require('child_process');
    const path = require('path');
    
    try {
        // Path to the Python script
        const pythonScript = path.join(__dirname, 'bluesky_dm.py');
        
        // Execute the Python script with recipient DID and message text as arguments
        const result = execSync(
            `python "${pythonScript}" "${recipientDid}" "${text}"`,
            { 
                encoding: 'utf8',
                env: { ...process.env }, // Pass all environment variables
                timeout: 30000 // 30 second timeout
            }
        );
        
        // Parse the JSON response from Python
        const response = JSON.parse(result.trim());
        
        if (response.success) {
            logger.info('Successfully sent direct message to Bluesky via Python:', response);
            return response;
        } else {
            logger.error('Python DM script failed:', response.error);
            throw new Error(`Python DM script failed: ${response.error}`);
        }
        
    } catch (error) {
        logger.error('Failed to execute Python DM script:', error);
        throw new Error('Failed to send direct message to Bluesky');
    }
} 