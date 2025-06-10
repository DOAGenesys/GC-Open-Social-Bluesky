# Bluesky API Integration Specification

This document details the technical specifications for integrating with the Bluesky API. The middleware will utilize the @atproto/api TypeScript SDK to interact with the Bluesky platform.

## 1. Authentication

The middleware will authenticate with the Bluesky API using a dedicated App Password. The Bluesky handle and App Password will be stored securely as environment variables (BLUESKY_HANDLE, BLUESKY_APP_PASSWORD).

An agent instance of the BskyAgent will be created and authenticated upon application startup. This agent will be used for all subsequent API calls.

```typescript
import { BskyAgent } from '@atproto/api';

const agent = new BskyAgent({
  service: 'https://bsky.social',
});

await agent.login({
  identifier: process.env.BLUESKY_HANDLE,
  password: process.env.BLUESKY_APP_PASSWORD,
});
```

## 2. Inbound Data Flow (Bluesky to Genesys Cloud)

### 2.1. Fetching Posts

The middleware will periodically fetch new posts from Bluesky to be ingested into Genesys Cloud. This includes:

- **Mentions**: Fetching notifications to identify when the authenticated user is mentioned. The listNotifications method will be used for this.
- **Author Feeds**: Monitoring the authenticated user's own feed for new posts and replies using getAuthorFeed.
- **Custom Feeds/Social Listening**: For social listening use cases, the middleware will fetch posts from specific feed generators (getFeed) or search for posts matching certain criteria (searchPosts).

### 2.2. Post Ingestion

Each relevant Bluesky post will be transformed into a Genesys Cloud Open Social Message. The following mapping will be applied:

- **text**: The text content of the Bluesky post.
- **createdAt**: The creation timestamp of the post.
- **embeds**:
  - **Images**: Images will be downloaded by the middleware, uploaded to a publicly accessible location (e.g., DigitalOcean Spaces), and included as attachments in the Genesys Cloud message. Alt text will be included in the message body.
  - **Quote Posts**: The text and a link to the quoted post will be included in the message body.
  - **External Links**: The URL and any available card information (title, description) will be included in the message body.
- **reply**: For replies, the middleware will fetch the parent and root posts to provide full context. The replyToId in the Genesys Cloud message will be set to the AT URI of the parent post.
- **facets**: Mentions and links within the post text will be formatted appropriately for display in Genesys Cloud.

### 2.3. User Identity

- The Bluesky user's DID (did), handle, display name, and avatar URL will be extracted from each post.
- This information will be used to create or update an external contact in Genesys Cloud, with the Bluesky DID serving as a unique identifier.

### 2.4. Likes and Reposts

- The middleware will monitor notifications for new likes and reposts of the authenticated user's posts.
- These interactions will be ingested as "reactions" into Genesys Cloud's social listening module.

## 3. Outbound Data Flow (Genesys Cloud to Bluesky)

### 3.1. Replying to Posts

When an agent sends a reply from Genesys Cloud, the middleware will:

- Receive the outbound message webhook from Genesys Cloud.
- Extract the inReplyToMessageId, which will contain the AT URI of the parent Bluesky post.
- Use the agent.post method to create a new post on Bluesky, including the reply object with the root and parent references (URI and CID) of the post being replied to. These references will be retrieved from the Redis cache. An example of the `agent.post` call is below:

```typescript
await agent.post({
  text: 'lol!',
  reply: {
    root: {
      uri: 'at://did:plc:abc.../app.bsky.feed.post/...',
      cid: 'bafy...',
    },
    parent: {
      uri: 'at://did:plc:abc.../app.bsky.feed.post/...',
      cid: 'bafy...',
    }
  },
  createdAt: new Date().toISOString()
})
```

### 3.2. Creating New Posts

- The middleware will provide a mechanism for agents to create new, top-level posts on Bluesky. This could be triggered by a specific keyword or command in a Genesys Cloud script.
- The agent.post method will be used to create the post.

### 3.3. Handling Attachments

If an agent sends a message with an attachment from Genesys Cloud, the middleware will:

- Download the attachment.
- Upload it to Bluesky using agent.uploadBlob.
- Include the blob reference in the embed object of the new post.

### 3.4. Direct Messages (Private Messages)

**⚠️ Important: Python Required for Direct Messages**

For private messages (DMs) from Genesys Cloud, the middleware uses a **hybrid Python/TypeScript approach** because:
- **The TypeScript `@atproto/api` SDK does NOT support Bluesky's chat/DM APIs**
- **Only the Python `atproto` library has full direct messaging support**

**Architecture Overview:**
- The middleware receives a webhook with `channel.type: 'Private'`
- Extracts the recipient DID from `channel.to.id`
- **TypeScript calls a Python script** (`src/services/bluesky_dm.py`) via `child_process.execSync()`
- **Python script** handles the actual DM sending using the mature Python `atproto` library
- **TypeScript** handles the response and delivery receipt back to Genesys Cloud

**Python Implementation** (`src/services/bluesky_dm.py`):
```python
from atproto import Client

client = Client()
client.login(username, password)

# Create chat proxy client
dm_client = client.with_bsky_chat_proxy()
dm = dm_client.chat.bsky.convo

# Get or create conversation
convo_response = dm.get_convo_for_members({'members': [recipient_did]})
convo_id = convo_response.convo.id

# Send the message
message_response = dm.send_message({
    'convo_id': convo_id,
    'message': {'text': message_text}
})
```

**TypeScript Integration**:
```typescript
const result = execSync(`python "${pythonScript}" "${recipientDid}" "${text}"`, {
    encoding: 'utf8',
    env: { ...process.env }
});
```

**Requirements**:
- Direct messaging requires the App Password to have "Direct Messages" scope enabled
- Python 3.x with `atproto==0.0.55` library installed (`pip install atproto==0.0.55`)
- Same environment variables (`BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`) are used by both TypeScript and Python components

### 3.5. Likes and Reposts from Agents

To enable agents to like or repost from Genesys Cloud, a specific workflow will be implemented:

- Agents can use a special command in a Genesys Cloud script (e.g., !like, !repost).
- The middleware will parse these commands and use the agent.like and agent.repost methods to perform the corresponding action on Bluesky. The uri and cid of the target post will be retrieved from the Redis cache.

## 4. State Management with Redis

A Redis database (Upstash or similar) will be used to store the mapping between Bluesky post URIs/CIDs and Genesys Cloud conversation IDs. This is crucial for:

- **Threading**: Correctly constructing reply chains.
- **Idempotency**: Preventing duplicate ingestion of the same post.
- **Interactions**: Associating likes and reposts with the correct conversation in Genesys Cloud.

The key-value store will have the following structure:

- **Key**: `bluesky:post:<post_uri>`
- **Value**: A JSON object containing `{ "cid": "...", "genesysConversationId": "..." }`