import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';

dotenv.config();

const { REDIS_URL, REDIS_TOKEN } = process.env;

if (!REDIS_URL || !REDIS_TOKEN) {
  throw new Error('Missing Redis credentials in environment variables');
}

export const redis = new Redis({
  url: REDIS_URL,
  token: REDIS_TOKEN,
});

export interface ConversationState {
  cid: string;
  genesysConversationId: string;
  rootUri: string;
}

export const setConversationState = async (postUri: string, state: ConversationState): Promise<void> => {
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
    
    await redis.set(`bluesky:post:${postUri}`, stateString);
  } catch (error) {
    console.error(`Failed to store Redis data for key bluesky:post:${postUri}:`, error, 'State:', state);
    throw error;
  }
};

export const getConversationState = async (postUri: string): Promise<ConversationState | null> => {
  const state = await redis.get(`bluesky:post:${postUri}`);
  if (state) {
    try {
      // Check if state is already a string or needs conversion
      const stateString = typeof state === 'string' ? state : JSON.stringify(state);
      
      // If the string is "[object Object]", it means the object was improperly converted
      if (stateString === '[object Object]') {
        console.error(`Corrupted Redis data for key bluesky:post:${postUri} - contains "[object Object]"`);
        return null;
      }
      
      return JSON.parse(stateString) as ConversationState;
    } catch (error) {
      console.error(`Failed to parse Redis data for key bluesky:post:${postUri}:`, error, 'Raw value:', state);
      return null;
    }
  }
  return null;
}; 