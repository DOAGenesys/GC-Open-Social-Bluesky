#!/usr/bin/env python3
"""
Bluesky Direct Message Polling Service
Polls for new direct messages from Bluesky conversations

Uses Redis for session persistence to avoid Bluesky's strict rate limit of 10 logins per 24 hours.
"""

import sys
import json
import os
import requests
from atproto import Client
from datetime import datetime, timezone

# Redis session storage keys
REDIS_SESSION_KEY = 'bluesky:session:dm_poll'

def get_redis_connection():
    """Get Redis connection details from environment"""
    redis_url = os.getenv('REDIS_URL')
    redis_token = os.getenv('REDIS_TOKEN')
    
    if not redis_url or not redis_token:
        return None, None
    
    return redis_url, redis_token

def get_stored_session():
    """Retrieve stored session from Redis (Upstash)"""
    redis_url, redis_token = get_redis_connection()
    if not redis_url or not redis_token:
        return None
    
    try:
        response = requests.get(
            f"{redis_url}/get/{REDIS_SESSION_KEY}",
            headers={"Authorization": f"Bearer {redis_token}"}
        )
        if response.status_code == 200:
            result = response.json().get('result')
            if result:
                return json.loads(result)
    except Exception as e:
        print(f"Warning: Failed to retrieve session from Redis: {e}", file=sys.stderr)
    
    return None

def store_session(session_data: dict):
    """Store session in Redis (Upstash) with 24 hour TTL"""
    redis_url, redis_token = get_redis_connection()
    if not redis_url or not redis_token:
        return
    
    try:
        # Store with 24 hour TTL (sessions typically last longer, but we refresh daily to be safe)
        # URL encode the JSON data for the REST API
        import urllib.parse
        encoded_data = urllib.parse.quote(json.dumps(session_data))
        response = requests.get(
            f"{redis_url}/setex/{REDIS_SESSION_KEY}/86400/{encoded_data}",
            headers={"Authorization": f"Bearer {redis_token}"}
        )
        if response.status_code == 200:
            print("Session stored successfully in Redis", file=sys.stderr)
    except Exception as e:
        print(f"Warning: Failed to store session in Redis: {e}", file=sys.stderr)

def create_client_with_session(username: str, password: str) -> Client:
    """
    Create a Bluesky client, using stored session if available.
    Only performs a fresh login when necessary.
    """
    client = Client()
    
    # Try to restore session from Redis
    stored_session = get_stored_session()
    
    if stored_session:
        try:
            # The atproto library stores session info that we can use to restore
            # We need to manually set the session using the stored data
            from atproto import models
            
            # Reconstruct the session object
            session_obj = models.ComAtprotoServerCreateSession.Response(
                access_jwt=stored_session.get('access_jwt', stored_session.get('accessJwt', '')),
                refresh_jwt=stored_session.get('refresh_jwt', stored_session.get('refreshJwt', '')),
                handle=stored_session.get('handle', ''),
                did=stored_session.get('did', ''),
                email=stored_session.get('email'),
                email_confirmed=stored_session.get('email_confirmed', stored_session.get('emailConfirmed')),
                did_doc=stored_session.get('did_doc', stored_session.get('didDoc')),
                active=stored_session.get('active', True),
                status=stored_session.get('status')
            )
            
            # Import the session into the client
            client._import_session_string(client._export_session_string())  # Initialize
            client._session = session_obj
            client.me = client._session
            
            print(f"Attempting to restore session from Redis for {username}", file=sys.stderr)
            
            # Verify the session is still valid by making a simple API call
            # This uses the existing session instead of logging in again
            try:
                client.get_profile(actor=username)
                print("Session verification successful - reusing existing session", file=sys.stderr)
                return client
            except Exception as verify_error:
                # Check if it's a rate limit error during verification
                error_str = str(verify_error)
                if 'RateLimitExceeded' in error_str or '429' in error_str:
                    print(f"Rate limited even with stored session: {verify_error}", file=sys.stderr)
                    raise  # Re-raise rate limit errors
                print(f"Session verification failed, will try fresh login: {verify_error}", file=sys.stderr)
                
        except Exception as e:
            error_str = str(e)
            if 'RateLimitExceeded' in error_str or '429' in error_str:
                # Don't try to login if we're rate limited - just fail
                raise Exception(f"Rate limited - cannot authenticate. Please wait until rate limit resets. Error: {e}")
            print(f"Stored session restore failed: {e}", file=sys.stderr)
            # Fall through to fresh login
    
    # Fresh login required
    print(f"Performing fresh login for {username}...", file=sys.stderr)
    client.login(username, password)
    
    # Store the new session for future use
    if client._session:
        session_dict = {
            'access_jwt': client._session.access_jwt,
            'refresh_jwt': client._session.refresh_jwt,
            'handle': client._session.handle,
            'did': client._session.did,
            'email': getattr(client._session, 'email', None),
            'email_confirmed': getattr(client._session, 'email_confirmed', None),
            'active': getattr(client._session, 'active', True),
        }
        store_session(session_dict)
    
    return client

def poll_direct_messages(since_timestamp: str = None) -> dict:
    """
    Poll for new direct messages from all conversations
    
    Args:
        since_timestamp: ISO timestamp to poll messages since (optional)
    
    Returns:
        dict: Response data with new messages or error information
    """
    try:
        # Get credentials from environment
        username = os.getenv('BLUESKY_HANDLE')
        password = os.getenv('BLUESKY_APP_PASSWORD')
        
        if not username or not password:
            return {
                'success': False, 
                'error': 'Missing BLUESKY_HANDLE or BLUESKY_APP_PASSWORD environment variables'
            }
        
        # Create client with session reuse
        client = create_client_with_session(username, password)
        
        # Create chat proxy client
        dm_client = client.with_bsky_chat_proxy()
        dm = dm_client.chat.bsky.convo
        
        # Get list of conversations
        convo_list = dm.list_convos()
        
        new_messages = []
        
        for convo in convo_list.convos:
            # Get messages from this conversation
            # If we have a since_timestamp, we can use it to filter
            messages_response = dm.get_messages({'convo_id': convo.id})
            
            for message in messages_response.messages:
                # Skip messages sent by us (the bot account)
                if message.sender.did == client.me.did:
                    continue
                
                # Convert sent_at to datetime for comparison
                message_time = datetime.fromisoformat(message.sent_at.replace('Z', '+00:00'))
                
                # If we have a since_timestamp, only include newer messages
                if since_timestamp:
                    since_time = datetime.fromisoformat(since_timestamp.replace('Z', '+00:00'))
                    if message_time <= since_time:
                        continue
                
                # Extract message data
                new_messages.append({
                    'id': message.id,
                    'convo_id': convo.id,
                    'sender_did': message.sender.did,
                    'sender_handle': getattr(message.sender, 'handle', ''),
                    'sender_display_name': getattr(message.sender, 'display_name', ''),
                    'text': message.text,
                    'sent_at': message.sent_at,
                    'conversation_members': [member.did for member in convo.members]
                })
        
        return {
            'success': True,
            'messages': new_messages,
            'bot_did': client.me.did,  # Include bot's DID for TypeScript
            'total_conversations': len(convo_list.convos),
            'new_message_count': len(new_messages)
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def main():
    """Main function to handle command line arguments"""
    since_timestamp = None
    if len(sys.argv) > 1:
        since_timestamp = sys.argv[1]
    
    result = poll_direct_messages(since_timestamp)
    print(json.dumps(result))
    
    # Exit with appropriate code
    sys.exit(0 if result['success'] else 1)

if __name__ == '__main__':
    main()