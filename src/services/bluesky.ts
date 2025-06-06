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

export const getBlueskyAgent = async (): Promise<BskyAgent> => {
  if (!_isLoggedIn) {
    await agent.login({
      identifier: BLUESKY_HANDLE,
      password: BLUESKY_APP_PASSWORD,
    });
    _isLoggedIn = true;
    logger.info('Successfully logged into Bluesky');
  }
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