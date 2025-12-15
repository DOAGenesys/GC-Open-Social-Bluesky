import { BskyAgent } from '@atproto/api';
import dotenv from 'dotenv';
import { getConversationState, redis } from './redis';
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

// Redis key for storing the session
const SESSION_REDIS_KEY = 'bluesky:session:typescript';

/**
 * Store the current session in Redis for persistence across restarts
 */
const storeSessionInRedis = async (): Promise<void> => {
  try {
    if (agent.session) {
      const sessionData = {
        accessJwt: agent.session.accessJwt,
        refreshJwt: agent.session.refreshJwt,
        handle: agent.session.handle,
        did: agent.session.did,
        email: agent.session.email,
        emailConfirmed: agent.session.emailConfirmed,
        active: agent.session.active,
      };
      // Store with 24 hour TTL
      await redis.set(SESSION_REDIS_KEY, JSON.stringify(sessionData), { ex: 86400 });
      logger.debug('Session stored in Redis successfully');
    }
  } catch (error) {
    logger.warn('Failed to store session in Redis:', error);
  }
};

/**
 * Retrieve stored session from Redis
 */
const getStoredSession = async (): Promise<any | null> => {
  try {
    const stored = await redis.get(SESSION_REDIS_KEY);
    if (stored && typeof stored === 'string') {
      return JSON.parse(stored);
    }
    if (stored && typeof stored === 'object') {
      return stored;
    }
  } catch (error) {
    logger.warn('Failed to retrieve session from Redis:', error);
  }
  return null;
};

const ensureAuthenticated = async (): Promise<void> => {
  try {
    // First check if we already have a valid in-memory session
    if (_isLoggedIn && agent.session) {
      try {
        await agent.getProfile({ actor: BLUESKY_HANDLE });
        return; // Session is still valid
      } catch (error: any) {
        // Check if it's a rate limit error - don't try to re-login if rate limited
        if (error.status === 429 || error.error === 'RateLimitExceeded') {
          logger.error('Rate limited by Bluesky. Cannot authenticate. Please wait for rate limit reset.');
          throw error; // Re-throw rate limit errors
        }
        // If we get a 401 or authentication error, we need to re-login
        if (error.status === 401 || error.error === 'AuthenticationRequired') {
          logger.warn('Session expired, will try to re-authenticate...');
          _isLoggedIn = false;
        } else {
          throw error; // Re-throw other errors
        }
      }
    }

    // Try to restore session from Redis (useful after process restart)
    if (!_isLoggedIn) {
      const storedSession = await getStoredSession();
      if (storedSession) {
        try {
          logger.info('Attempting to restore session from Redis...');
          // Resume the session using stored tokens
          await agent.resumeSession({
            accessJwt: storedSession.accessJwt,
            refreshJwt: storedSession.refreshJwt,
            handle: storedSession.handle,
            did: storedSession.did,
            email: storedSession.email,
            emailConfirmed: storedSession.emailConfirmed,
            active: storedSession.active ?? true,
          });
          
          // Verify the restored session works
          await agent.getProfile({ actor: BLUESKY_HANDLE });
          
          _isLoggedIn = true;
          logger.info('Successfully restored session from Redis');
          
          // Update the stored session (tokens may have been refreshed)
          await storeSessionInRedis();
          return;
        } catch (restoreError: any) {
          // Check if it's a rate limit error
          if (restoreError.status === 429 || restoreError.error === 'RateLimitExceeded') {
            logger.error('Rate limited by Bluesky while restoring session. Cannot authenticate.');
            throw restoreError;
          }
          logger.warn('Failed to restore session from Redis, will perform fresh login:', restoreError.message);
        }
      }
    }

    // Fresh login required - use sparingly due to 10/day rate limit!
    logger.info('Performing fresh Bluesky login (limited to 10 per 24 hours)...');
    const identifier = BLUESKY_HANDLE.includes('.') ? BLUESKY_HANDLE : `${BLUESKY_HANDLE}.bsky.social`;
    
    await agent.login({
      identifier,
      password: BLUESKY_APP_PASSWORD,
    });
    
    _isLoggedIn = true;
    logger.info(`Successfully logged into Bluesky as ${identifier}`);
    
    // Store the session for future use
    await storeSessionInRedis();
    
  } catch (error: any) {
    _isLoggedIn = false;
    if (error.status === 429 || error.error === 'RateLimitExceeded') {
      throw new Error('Bluesky rate limit exceeded for login. You can only login 10 times per 24 hours. Please wait until the rate limit resets.');
    }
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
        // Path to the Python script (resolve from project root, not dist folder)
        const pythonScript = path.join(process.cwd(), 'src', 'services', 'bluesky_dm.py');
        
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