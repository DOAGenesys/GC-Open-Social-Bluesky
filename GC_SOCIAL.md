# Genesys Cloud Open Social Messaging Integration Specification

This document outlines the technical specifications for integrating with the Genesys Cloud Open Social Messaging API using raw API callouts with OAuth Client Credentials.

## 1. Integration Setup

A new Open Messaging integration will be created in the Genesys Cloud organization. This integration provides the integrationId and outboundNotificationWebhookSignatureSecretToken required for the middleware's configuration.

## 2. Authentication

All API requests to Genesys Cloud must include an `Authorization: Bearer <access_token>` header. The access token is obtained using the OAuth Client Credentials flow with the provided GC_CC_CLIENT_ID and GC_CC_CLIENT_SECRET.

**Note:** We will not use the Genesys Cloud JavaScript SDK (purecloud-platform-client-v2). All interactions with the Genesys Cloud API will be performed using raw HTTP requests with proper authentication headers.

## 3. Inbound Messages (Bluesky to Genesys Cloud)

The middleware uses two different endpoints for ingesting inbound messages from Bluesky, depending on the message type:

### 3.1. Public Posts and Social Listening (Social Media Ingestion)

For **public posts, mentions, and social listening**, the middleware uses the Social Media ingestion endpoint:

**Endpoint**: `POST /api/v2/socialmedia/topics/{topicId}/dataingestionrules/open/{ruleId}/messages/bulk`

**Usage**:
- Public posts and replies from Bluesky
- Social listening results (posts containing search keywords)
- Mentions and notifications
- **Channel Type**: Must be `Public` (only supported type for this endpoint)

### 3.2. Direct Messages (Open Messaging Inbound)

For **private messages (DMs)**, the middleware uses the Open Messaging inbound endpoint:

**Endpoint**: `POST /api/v2/conversations/messages/{integrationId}/inbound/open/message`

**Usage**:
- Direct messages from Bluesky users
- Private conversations initiated by customers
- **Channel Type**: Supports `Private` conversations
- **Key Difference**: Uses Integration ID instead of Topic/Rule IDs

**⚠️ Important**: The Social Media ingestion endpoint **does not support** private messages. Attempting to send `type: "Private"` messages to the social media endpoint will result in a `400 Bad Request` error:

```
Value [Private] is not valid for field type [OpenSocialMediaChannelType]. 
Allowable values are: Public
```

### 3.3. Message Format Differences

#### Social Media Ingestion Format (Public Posts)

Each Bluesky post is transformed into a Genesys Cloud Open Social Message with the following structure:

```json
{
  "channel": {
    "messageId": "<Bluesky Post AT URI>",
    "from": {
      "nickname": "<Bluesky User Handle>",
      "id": "<Bluesky User DID>",
      "idType": "Opaque",
      "image": "<URL to Bluesky User Avatar>",
      "firstName": "<Bluesky User Display Name>",
      "lastName": ""
    },
    "time": "<Bluesky Post Creation Timestamp in ISO-8601 format>",
    "publicMetadata": {
      "rootId": "<AT URI of the root post in the thread>",
      "replyToId": "<AT URI of the parent post>"
    }
  },
  "text": "<Full text of the Bluesky post, including formatted links and mentions>",
  "content": [
    {
      "contentType": "Attachment",
      "attachment": {
        "mediaType": "Image",
        "url": "<Public URL of the downloaded image>",
        "mime": "<MIME type of the image>",
        "filename": "<Original filename of the image>"
      }
    }
  ]
}
```

**Endpoint Details:**

- **Method:** POST
- **URL:** `/api/v2/socialmedia/topics/{topicId}/dataingestionrules/open/{ruleId}/messages/bulk`
- **Path Parameters:**
  - topicId: The ID of the social media topic (string, required).Still getting an error for Bluesky -> GC DMs, see logs:

[gc-open-social---bluesky] [2025-06-10 21:03:14] [DEBUG] Starting DM polling cycle...
[gc-open-social---bluesky] [2025-06-10 21:03:14] [DEBUG] Last DM check timestamp: 2025-06-10T20:51:06.235Z
[gc-open-social---bluesky] [2025-06-10 21:03:14] [DEBUG] Executing DM polling command: python "/workspace/src/services/bluesky_dm_poll.py" "2025-06-10T20:51:06.235Z"
[gc-open-social---bluesky] [2025-06-10 21:03:24] [DEBUG] Python script output: {"success": true, "messages": [{"id": "3lrbs5g324w2q", "convo_id": "3lrboqlndcf2v", "sender_did": "did:plc:sbgfuxxuytgb65bjytiijovp", "sender_handle": "", "sender_display_name": "", "text": "resp9", "sent_at": "2025-06-10T21:03:21.043Z", "conversation_members": ["did:plc:5aanyuzkseawdmqgiv24n2iq", "did:plc:sbgfuxxuytgb65bjytiijovp"]}], "bot_did": "did:plc:5aanyuzkseawdmqgiv24n2iq", "total_conversations": 1, "new_message_count": 1}
[gc-open-social---bluesky] [2025-06-10 21:03:24] 
[gc-open-social---bluesky] [2025-06-10 21:03:24] [DEBUG] DM polling results: 1 new messages from 1 total conversations
[gc-open-social---bluesky] [2025-06-10 21:03:24] [INFO] Found 1 new DM(s) to process
[gc-open-social---bluesky] [2025-06-10 21:03:24] [INFO] Processing DM from : "resp9"
[gc-open-social---bluesky] [2025-06-10 21:03:24] [DEBUG] Creating/updating contact for DID: did:plc:sbgfuxxuytgb65bjytiijovp, displayName: , handle: 
[gc-open-social---bluesky] [2025-06-10 21:03:24] [DEBUG] Contact payload: {
[gc-open-social---bluesky] [2025-06-10 21:03:24]   firstName: '',
[gc-open-social---bluesky] [2025-06-10 21:03:24]   division: { id: 'a8580fb4-5fdd-41e2-9e6b-33305bd00429' },
[gc-open-social---bluesky] [2025-06-10 21:03:24]   externalIds: [
[gc-open-social---bluesky] [2025-06-10 21:03:24]     {
[gc-open-social---bluesky] [2025-06-10 21:03:24]       externalSource: [Object],
[gc-open-social---bluesky] [2025-06-10 21:03:24]       value: 'did:plc:sbgfuxxuytgb65bjytiijovp'
[gc-open-social---bluesky] [2025-06-10 21:03:24]     }
[gc-open-social---bluesky] [2025-06-10 21:03:24]   ]
[gc-open-social---bluesky] [2025-06-10 21:03:24] }
[gc-open-social---bluesky] [2025-06-10 21:03:24] [DEBUG] Searching for existing contact with URL: /api/v2/externalcontacts/contacts?q=did%3Aplc%3Asbgfuxxuytgb65bjytiijovp
[gc-open-social---bluesky] [2025-06-10 21:03:24] [INFO] Received valid webhook from Genesys Cloud: {
[gc-open-social---bluesky] [2025-06-10 21:03:24]   id: 'd7d58935af65a45e5234ac77de017a0a',
[gc-open-social---bluesky] [2025-06-10 21:03:24]   channel: {
[gc-open-social---bluesky] [2025-06-10 21:03:24]     id: 'e6b352de-ecd0-49c7-94de-7787418869bc',
[gc-open-social---bluesky] [2025-06-10 21:03:24]     platform: 'Open',
[gc-open-social---bluesky] [2025-06-10 21:03:24]     type: 'Private',
[gc-open-social---bluesky] [2025-06-10 21:03:24]     to: { id: 'did:plc:sbgfuxxuytgb65bjytiijovp', idType: 'Opaque' },
[gc-open-social---bluesky] [2025-06-10 21:03:24]     from: {
[gc-open-social---bluesky] [2025-06-10 21:03:24]       nickname: 'Bluesky - Open Social - DO',
[gc-open-social---bluesky] [2025-06-10 21:03:24]       id: 'e6b352de-ecd0-49c7-94de-7787418869bc',
[gc-open-social---bluesky] [2025-06-10 21:03:24]       idType: 'Opaque'
[gc-open-social---bluesky] [2025-06-10 21:03:24]     },
[gc-open-social---bluesky] [2025-06-10 21:03:24]     time: '2025-06-10T21:03:05.427Z',
[gc-open-social---bluesky] [2025-06-10 21:03:24]     messageId: 'd7d58935af65a45e5234ac77de017a0a'
[gc-open-social---bluesky] [2025-06-10 21:03:24]   },
[gc-open-social---bluesky] [2025-06-10 21:03:24]   type: 'Text',
[gc-open-social---bluesky] [2025-06-10 21:03:24]   text: 'Hi',
[gc-open-social---bluesky] [2025-06-10 21:03:24]   originatingEntity: 'Human',
[gc-open-social---bluesky] [2025-06-10 21:03:24]   direction: 'Outbound',
[gc-open-social---bluesky] [2025-06-10 21:03:24]   conversationId: '5d0d331e-d2a8-4fb5-96f7-7021bef2a8ee'
[gc-open-social---bluesky] [2025-06-10 21:03:24] }
[gc-open-social---bluesky] [2025-06-10 21:03:24] [DEBUG] Checking deduplication for message ID: d7d58935af65a45e5234ac77de017a0a with key: webhook:processed:d7d58935af65a45e5234ac77de017a0a
[gc-open-social---bluesky] [2025-06-10 21:03:24] [DEBUG] Deduplication check result for d7d58935af65a45e5234ac77de017a0a: DUPLICATE
[gc-open-social---bluesky] [2025-06-10 21:03:24] [WARN] SKIPPING DUPLICATE webhook message with ID: d7d58935af65a45e5234ac77de017a0a (previously processed at: 2025-06-10T21:03:05.757Z)
[gc-open-social---bluesky] [2025-06-10 21:03:24] [INFO] Successfully retrieved Genesys Cloud access token
[gc-open-social---bluesky] [2025-06-10 21:03:24] [INFO] Successfully retrieved Genesys Cloud access token
[gc-open-social---bluesky] [2025-06-10 21:03:25] [DEBUG] Search response: { status: 200, entitiesCount: 0, entities: [] }
[gc-open-social---bluesky] [2025-06-10 21:03:25] [DEBUG] Creating new contact with payload: {
[gc-open-social---bluesky] [2025-06-10 21:03:25]   firstName: '',
[gc-open-social---bluesky] [2025-06-10 21:03:25]   division: { id: 'a8580fb4-5fdd-41e2-9e6b-33305bd00429' },
[gc-open-social---bluesky] [2025-06-10 21:03:25]   externalIds: [
[gc-open-social---bluesky] [2025-06-10 21:03:25]     {
[gc-open-social---bluesky] [2025-06-10 21:03:25]       externalSource: [Object],
[gc-open-social---bluesky] [2025-06-10 21:03:25]       value: 'did:plc:sbgfuxxuytgb65bjytiijovp'
[gc-open-social---bluesky] [2025-06-10 21:03:25]     }
[gc-open-social---bluesky] [2025-06-10 21:03:25]   ]
[gc-open-social---bluesky] [2025-06-10 21:03:25] }
[gc-open-social---bluesky] [2025-06-10 21:03:25] [INFO] Successfully sent delivery receipt to Genesys Cloud
[gc-open-social---bluesky] [2025-06-10 21:03:25] [INFO] Successfully processed private message.
[gc-open-social---bluesky] [2025-06-10 21:03:25] [INFO] Social listening search query: "Genesys Cloud Virtual Agents"
[gc-open-social---bluesky] [2025-06-10 21:03:25] [DEBUG] Social listening cursor: none (first poll)
[gc-open-social---bluesky] [2025-06-10 21:03:25] [DEBUG] Bluesky search request params: { q: 'Genesys Cloud Virtual Agents', cursor: undefined }
[gc-open-social---bluesky] [2025-06-10 21:03:25] [INFO] Successfully created external contact in Genesys Cloud
[gc-open-social---bluesky] [2025-06-10 21:03:25] [DEBUG] Genesys Cloud DM message structure: {
[gc-open-social---bluesky] [2025-06-10 21:03:25]   "channel": {
[gc-open-social---bluesky] [2025-06-10 21:03:25]     "messageId": "3lrbs5g324w2q",
[gc-open-social---bluesky] [2025-06-10 21:03:25]     "platform": "Open",
[gc-open-social---bluesky] [2025-06-10 21:03:25]     "type": "Private",
[gc-open-social---bluesky] [2025-06-10 21:03:25]     "from": {
[gc-open-social---bluesky] [2025-06-10 21:03:25]       "nickname": "did:plc:sbgfuxxuytgb65bjytiijovp",
[gc-open-social---bluesky] [2025-06-10 21:03:25]       "id": "did:plc:sbgfuxxuytgb65bjytiijovp",
[gc-open-social---bluesky] [2025-06-10 21:03:25]       "idType": "Opaque",
[gc-open-social---bluesky] [2025-06-10 21:03:25]       "firstName": ""
[gc-open-social---bluesky] [2025-06-10 21:03:25]     },
[gc-open-social---bluesky] [2025-06-10 21:03:25]     "to": {
[gc-open-social---bluesky] [2025-06-10 21:03:25]       "id": "did:plc:5aanyuzkseawdmqgiv24n2iq",
[gc-open-social---bluesky] [2025-06-10 21:03:25]       "idType": "Opaque"
[gc-open-social---bluesky] [2025-06-10 21:03:25]     },
[gc-open-social---bluesky] [2025-06-10 21:03:25]     "time": "2025-06-10T21:03:21.043Z",
[gc-open-social---bluesky] [2025-06-10 21:03:25]     "publicMetadata": {
[gc-open-social---bluesky] [2025-06-10 21:03:25]       "rootId": "3lrboqlndcf2v",
[gc-open-social---bluesky] [2025-06-10 21:03:25]       "replyToId": "3lrbs5g324w2q"
[gc-open-social---bluesky] [2025-06-10 21:03:25]     }
[gc-open-social---bluesky] [2025-06-10 21:03:25]   },
[gc-open-social---bluesky] [2025-06-10 21:03:25]   "text": "resp9"
[gc-open-social---bluesky] [2025-06-10 21:03:25] }
[gc-open-social---bluesky] [2025-06-10 21:03:25] [DEBUG] Ingesting 1 message(s) to Genesys Cloud...
[gc-open-social---bluesky] [2025-06-10 21:03:25] [DEBUG] Using Topic ID: f58020d5-1705-488b-8345-88ec5ab9a823, Rule ID: 72d9c6b1-fb3d-40af-a2b9-8da6eead806a
[gc-open-social---bluesky] [2025-06-10 21:03:25] [ERROR] Failed to ingest messages into Genesys Cloud: {
[gc-open-social---bluesky] [2025-06-10 21:03:25]   status: 400,
[gc-open-social---bluesky] [2025-06-10 21:03:25]   statusText: 'Bad Request',
[gc-open-social---bluesky] [2025-06-10 21:03:25]   data: {
[gc-open-social---bluesky] [2025-06-10 21:03:25]     message: 'Value [Private] is not valid for field type [OpenSocialMediaChannelType]. Allowable values are: Public',
[gc-open-social---bluesky] [2025-06-10 21:03:25]     code: 'invalid.value',
[gc-open-social---bluesky] [2025-06-10 21:03:25]     status: 400,
[gc-open-social---bluesky] [2025-06-10 21:03:25]     contextId: '776052dd-cab3-48ed-8281-9555bb6761be',
[gc-open-social---bluesky] [2025-06-10 21:03:25]     details: [],
[gc-open-social---bluesky] [2025-06-10 21:03:25]     errors: []
[gc-open-social---bluesky] [2025-06-10 21:03:25]   },
[gc-open-social---bluesky] [2025-06-10 21:03:25]   url: '/api/v2/socialmedia/topics/f58020d5-1705-488b-8345-88ec5ab9a823/dataingestionrules/open/72d9c6b1-fb3d-40af-a2b9-8da6eead806a/messages/bulk',
[gc-open-social---bluesky] [2025-06-10 21:03:25]   method: 'post'
[gc-open-social---bluesky] [2025-06-10 21:03:25] }
[gc-open-social---bluesky] [2025-06-10 21:03:25] [ERROR] Request payload that failed: [
[gc-open-social---bluesky] [2025-06-10 21:03:25]   {
[gc-open-social---bluesky] [2025-06-10 21:03:25]     "channel": {
[gc-open-social---bluesky] [2025-06-10 21:03:25]       "messageId": "3lrbs5g324w2q",
[gc-open-social---bluesky] [2025-06-10 21:03:25]       "platform": "Open",
[gc-open-social---bluesky] [2025-06-10 21:03:25]       "type": "Private",
[gc-open-social---bluesky] [2025-06-10 21:03:25]       "from": {
[gc-open-social---bluesky] [2025-06-10 21:03:25]         "nickname": "did:plc:sbgfuxxuytgb65bjytiijovp",
[gc-open-social---bluesky] [2025-06-10 21:03:25]         "id": "did:plc:sbgfuxxuytgb65bjytiijovp",
[gc-open-social---bluesky] [2025-06-10 21:03:25]         "idType": "Opaque",
[gc-open-social---bluesky] [2025-06-10 21:03:25]         "firstName": ""
[gc-open-social---bluesky] [2025-06-10 21:03:25]       },
[gc-open-social---bluesky] [2025-06-10 21:03:25]       "to": {
[gc-open-social---bluesky] [2025-06-10 21:03:25]         "id": "did:plc:5aanyuzkseawdmqgiv24n2iq",
[gc-open-social---bluesky] [2025-06-10 21:03:25]         "idType": "Opaque"
[gc-open-social---bluesky] [2025-06-10 21:03:25]       },
[gc-open-social---bluesky] [2025-06-10 21:03:25]       "time": "2025-06-10T21:03:21.043Z",
[gc-open-social---bluesky] [2025-06-10 21:03:25]       "publicMetadata": {
[gc-open-social---bluesky] [2025-06-10 21:03:25]         "rootId": "3lrboqlndcf2v",
[gc-open-social---bluesky] [2025-06-10 21:03:25]         "replyToId": "3lrbs5g324w2q"
[gc-open-social---bluesky] [2025-06-10 21:03:25]       }
[gc-open-social---bluesky] [2025-06-10 21:03:25]     },
[gc-open-social---bluesky] [2025-06-10 21:03:25]     "text": "resp9"
[gc-open-social---bluesky] [2025-06-10 21:03:25]   }
[gc-open-social---bluesky] [2025-06-10 21:03:25] ]
[gc-open-social---bluesky] [2025-06-10 21:03:25] [ERROR] Failed to process DM from : Error: Failed to ingest messages into Genesys Cloud
[gc-open-social---bluesky] [2025-06-10 21:03:25]     at /workspace/dist/services/genesys.js:97:15
[gc-open-social---bluesky] [2025-06-10 21:03:25]     at Generator.throw (<anonymous>)
[gc-open-social---bluesky] [2025-06-10 21:03:25]     at rejected (/workspace/dist/services/genesys.js:6:65)
[gc-open-social---bluesky] [2025-06-10 21:03:25]     at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
[gc-open-social---bluesky] [2025-06-10 21:03:25] [DEBUG] Updated last DM check timestamp to: 2025-06-10T21:03:25.162Z
[gc-open-social---bluesky] [2025-06-10 21:03:25] [INFO] No new notifications.
[gc-open-social---bluesky] [2025-06-10 21:03:25] [DEBUG] Bluesky search response - posts found: 1, cursor: none
[gc-open-social---bluesky] [2025-06-10 21:03:25] [DEBUG] Full search response metadata: { postsCount: 1, cursor: undefined, hasHeaders: true, status: true }
[gc-open-social---bluesky] [2025-06-10 21:03:25] [INFO] Found 1 posts from social listening.
[gc-open-social---bluesky] [2025-06-10 21:03:25] [DEBUG] Found post: at://did:plc:sbgfuxxuytgb65bjytiijovp/app.bsky.feed.post/3lrbi7scmqc2e by @gcopensocialdemo.bsky.social - "I'm excited about Genesys Cloud Virtual Agents. GenAI turnkey services directly into the contact cen..."
[gc-open-social---bluesky] [2025-06-10 21:03:25] [DEBUG] Skipping already processed post from social listening: at://did:plc:sbgfuxxuytgb65bjytiijovp/app.bsky.feed.post/3lrbi7scmqc2e
[gc-open-social---bluesky] [2025-06-10 21:03:25] [DEBUG] Total posts to process: 0 (out of 1 found)
[gc-open-social---bluesky] [2025-06-10 21:03:25] [DEBUG] All found posts were already processed, no new posts to ingest
[gc-open-social---bluesky] [2025-06-10 21:04:14] [DEBUG] Starting DM polling cycle...
[gc-open-social---bluesky] [2025-06-10 21:04:14] [DEBUG] Last DM check timestamp: 2025-06-10T21:03:25.162Z
[gc-open-social---bluesky] [2025-06-10 21:04:14] [DEBUG] Executing DM polling command: python "/workspace/src/services/bluesky_dm_poll.py" "2025-06-10T21:03:25.162Z"
[gc-open-social---bluesky] [2025-06-10 21:04:24] [DEBUG] Python script output: {"success": true, "messages": [], "bot_did": "did:plc:5aanyuzkseawdmqgiv24n2iq", "total_conversations": 1, "new_message_count": 0}
[gc-open-social---bluesky] [2025-06-10 21:04:24] 
[gc-open-social---bluesky] [2025-06-10 21:04:24] [DEBUG] DM polling results: 0 new messages from 1 total conversations
[gc-open-social---bluesky] [2025-06-10 21:04:24] [DEBUG] No new DMs found
[gc-open-social---bluesky] [2025-06-10 21:04:24] [INFO] Social listening search query: "Genesys Cloud Virtual Agents"
[gc-open-social---bluesky] [2025-06-10 21:04:24] [DEBUG] Social listening cursor: none (first poll)
[gc-open-social---bluesky] [2025-06-10 21:04:24] [DEBUG] Bluesky search request params: { q: 'Genesys Cloud Virtual Agents', cursor: undefined }
[gc-open-social---bluesky] [2025-06-10 21:04:24] [INFO] No new notifications.
[gc-open-social---bluesky] [2025-06-10 21:04:25] [DEBUG] Bluesky search response - posts found: 1, cursor: none
[gc-open-social---bluesky] [2025-06-10 21:04:25] [DEBUG] Full search response metadata: { postsCount: 1, cursor: undefined, hasHeaders: true, status: true }
[gc-open-social---bluesky] [2025-06-10 21:04:25] [INFO] Found 1 posts from social listening.
[gc-open-social---bluesky] [2025-06-10 21:04:25] [DEBUG] Found post: at://did:plc:sbgfuxxuytgb65bjytiijovp/app.bsky.feed.post/3lrbi7scmqc2e by @gcopensocialdemo.bsky.social - "I'm excited about Genesys Cloud Virtual Agents. GenAI turnkey services directly into the contact cen..."
[gc-open-social---bluesky] [2025-06-10 21:04:25] [DEBUG] Skipping already processed post from social listening: at://did:plc:sbgfuxxuytgb65bjytiijovp/app.bsky.feed.post/3lrbi7scmqc2e
[gc-open-social---bluesky] [2025-06-10 21:04:25] [DEBUG] Total posts to process: 0 (out of 1 found)
[gc-open-social---bluesky] [2025-06-10 21:04:25] [DEBUG] All found posts were already processed, no new posts to ingest

  - ruleId: The ID of the data ingestion rule (string, required).
- **Request Body:** An array of the above message objects.
- **Response:** On success, returns a JSON object with entities array containing ingested message details. Key field: `entities[].id` (Genesys Cloud message ID).

#### Open Messaging Inbound Format (Direct Messages)

Each Bluesky DM is transformed into an Open Messaging inbound message with this simplified structure:

```json
{
  "channel": {
    "messageId": "<Bluesky DM Message ID>",
    "from": {
      "nickname": "<Bluesky User Handle or DID>",
      "id": "<Bluesky User DID>",
      "idType": "Opaque",
      "firstName": "<Bluesky User Display Name>"
    },
    "time": "<Bluesky DM Creation Timestamp in ISO-8601 format>"
  },
  "text": "<DM text content>",
  "direction": "Inbound"
}
```

**Endpoint Details:**

- **Method:** POST
- **URL:** `/api/v2/conversations/messages/{integrationId}/inbound/open/message`
- **Path Parameters:**
  - integrationId: The ID of the Open Messaging integration (string, required).
- **Request Body:** A single message object (not an array).
- **Response:** On success, returns a JSON object with the created message details.

### 3.4. Social Listening

A dedicated Social Listening Topic will be created in Genesys Cloud.
The middleware uses a Data Ingestion Rule associated with this topic to ingest Bluesky posts matching specific criteria (keywords, hashtags, etc.).

**Note**: Social listening only applies to public posts and uses the Social Media ingestion endpoint.

### 3.5. Identity Resolution

When a new Bluesky user is encountered, the middleware creates an External Contact in Genesys Cloud using the `POST /api/v2/externalcontacts/contacts` endpoint.

**Endpoint Details:**

- **Method:** POST
- **URL:** `/api/v2/externalcontacts/contacts`
- **Request Body:**

```json
{
  "firstName": "<Bluesky User Display Name>",
  "division": {
    "id": "<Division ID>"
  },
  "externalIds": [
    {
      "externalSource": {
        "id": "<External Source ID>"
      },
      "value": "<Bluesky User DID>"
    }
  ]
}
```

- **firstName:** The display name of the Bluesky user (string, required if available).
- **division:** Object containing the division ID where the contact will be stored (required).
- **externalIds:** Array of external identifiers (required). externalSource must be an object with the ID of the "Bluesky" external source, and value is the Bluesky DID.

**Note:** Do not include empty fields like lastName. Only include fields with actual values to avoid API validation errors.

- **Response:** On success, returns the created contact object with an id field (Genesys Cloud contact ID).

The Identity Resolution settings for the Open Messaging integration will use this External Source to associate all interactions from a Bluesky user with the same contact.

## 4. Outbound Messages (Genesys Cloud to Bluesky)

The middleware receives outbound messages from Genesys Cloud via a webhook.

### 4.1. Webhook Configuration

- **outboundNotificationWebhookUrl:** The middleware exposes a secure endpoint to receive webhook POST requests from Genesys Cloud.
- **outboundNotificationWebhookSignatureSecretToken:** Used to validate the signature of incoming webhooks, ensuring they originate from Genesys Cloud.

### 4.2. Outbound Message Handling

When an agent sends a message, the middleware receives a payload in the OpenOutboundNormalizedMessage format and:

1. Parses the textBody, inReplyToMessageId, attachments, and channel type.
2. Determines the action based on channel type:
   - **Private Messages** (`channel.type: 'Private'`): Sends as direct message via **Python script** (required because TypeScript SDK doesn't support DMs)
   - **Public Messages** with `inReplyToMessageId`: Sends a reply to the Bluesky post using TypeScript
   - **Special Commands** (`!like`, `!repost`): Triggers corresponding Bluesky action using TypeScript
3. **Important**: For direct messages, the middleware calls a Python script because:
   - **The TypeScript `@atproto/api` SDK does NOT support Bluesky's chat/DM APIs**
   - **Only the Python `atproto` library has full direct messaging support**
4. Uses the appropriate API (Python for DMs, TypeScript for everything else) to perform the action.

### 4.3. Receipts

The middleware sends receipts back to Genesys Cloud using the `POST /api/v2/conversations/messages/{integrationId}/inbound/open/receipt` endpoint to confirm the status of outbound messages.

**Endpoint Details:**

- **Method:** POST
- **URL:** `/api/v2/conversations/messages/{integrationId}/inbound/open/receipt`
- **Path Parameters:**
  - integrationId: The ID of the Open Messaging integration (string, required).
- **Request Body:**

**Success example:**
```json
{
  "id": "<Genesys Cloud Message ID>",
  "channel": {
    "messageId": "<Bluesky Post AT URI>"
  },
  "status": "Delivered",
  "isFinalReceipt": true
}
```

**Failure example:**
```json
{
  "id": "<Genesys Cloud Message ID>",
  "channel": {
    "messageId": "<Bluesky Post AT URI>"
  },
  "status": "Failed",
  "reasons": [
    {
      "code": "<Error Code>",
      "message": "<Error Message>"
    }
  ],
  "isFinalReceipt": true
}
```

- **id:** The Genesys Cloud message ID (string, required).
- **channel.messageId:** The Bluesky post URI (string, required if applicable).
- **status:** One of "Sent", "Delivered", "Failed", "Published", "Removed" (string, required).
- **reasons:** Array of error details (required if status is "Failed").
- **isFinalReceipt:** Boolean indicating if this is the final receipt (required).
- **Response:** Typically, a 200 OK with no body.

## 5. Retrieving Message Details

To retrieve details of a specific message, the middleware can use the `GET /api/v2/conversations/messages/{messageId}/details` endpoint.

**Endpoint Details:**

- **Method:** GET
- **URL:** `/api/v2/conversations/messages/{messageId}/details`
- **Path Parameters:**
  - messageId: The ID of the message to retrieve (string, required).
- **Query Parameters:**
  - useNormalizedMessage: Set to true to return the normalized message format (boolean, optional).
- **Response:** Returns a JSON object with message details. Key fields in normalizedMessage include channel, text, and content if useNormalizedMessage is true.