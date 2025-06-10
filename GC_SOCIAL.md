# Genesys Cloud Open Social Messaging Integration Specification

This document outlines the technical specifications for integrating with the Genesys Cloud Open Social Messaging API using raw API callouts with OAuth Client Credentials.

## 1. Integration Setup

A new Open Messaging integration will be created in the Genesys Cloud organization. This integration provides the integrationId and outboundNotificationWebhookSignatureSecretToken required for the middleware's configuration.

## 2. Authentication

All API requests to Genesys Cloud must include an `Authorization: Bearer <access_token>` header. The access token is obtained using the OAuth Client Credentials flow with the provided GC_CC_CLIENT_ID and GC_CC_CLIENT_SECRET.

**Note:** We will not use the Genesys Cloud JavaScript SDK (purecloud-platform-client-v2). All interactions with the Genesys Cloud API will be performed using raw HTTP requests with proper authentication headers.

## 3. Inbound Messages (Bluesky to Genesys Cloud)

The middleware sends inbound Bluesky messages to Genesys Cloud using the `POST /api/v2/socialmedia/topics/{topicId}/dataingestionrules/open/{ruleId}/messages/bulk` endpoint.

### 3.1. Message Format

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
  - topicId: The ID of the social media topic (string, required).
  - ruleId: The ID of the data ingestion rule (string, required).
- **Request Body:** An array of the above message objects.
- **Response:** On success, returns a JSON object with entities array containing ingested message details. Key field: `entities[].id` (Genesys Cloud message ID).

### 3.2. Social Listening

A dedicated Social Listening Topic will be created in Genesys Cloud.
The middleware uses a Data Ingestion Rule associated with this topic to ingest Bluesky posts matching specific criteria (keywords, hashtags, etc.).

### 3.3. Identity Resolution

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