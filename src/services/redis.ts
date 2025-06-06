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
  await redis.set(`bluesky:post:${postUri}`, JSON.stringify(state));
};

export const getConversationState = async (postUri: string): Promise<ConversationState | null> => {
  const state = await redis.get(`bluesky:post:${postUri}`);
  if (state) {
    return JSON.parse(state as string) as ConversationState;
  }
  return null;
}; 