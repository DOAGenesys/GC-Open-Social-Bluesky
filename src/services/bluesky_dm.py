#!/usr/bin/env python3
"""
Bluesky Direct Message Handler
Handles direct messaging functionality using the Python atproto SDK

Uses Redis for session persistence to avoid Bluesky's strict rate limit of 10 logins per 24 hours.
"""

import sys
import json
import os
import requests
from atproto import Client

# Redis session storage key - shared with dm_poll for session reuse
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
        # Store with 24 hour TTL
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
            
            client._session = session_obj
            client.me = client._session
            
            print(f"Attempting to restore session from Redis for {username}", file=sys.stderr)
            
            # Verify the session is still valid
            try:
                client.get_profile(actor=username)
                print("Session verification successful - reusing existing session", file=sys.stderr)
                return client
            except Exception as verify_error:
                error_str = str(verify_error)
                if 'RateLimitExceeded' in error_str or '429' in error_str:
                    print(f"Rate limited even with stored session: {verify_error}", file=sys.stderr)
                    raise
                print(f"Session verification failed, will try fresh login: {verify_error}", file=sys.stderr)
                
        except Exception as e:
            error_str = str(e)
            if 'RateLimitExceeded' in error_str or '429' in error_str:
                raise Exception(f"Rate limited - cannot authenticate. Please wait until rate limit resets. Error: {e}")
            print(f"Stored session restore failed: {e}", file=sys.stderr)
    
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

def send_direct_message(recipient_did: str, message_text: str) -> dict:
    """
    Send a direct message to a Bluesky user
    
    Args:
        recipient_did: The DID of the recipient
        message_text: The text message to send
    
    Returns:
        dict: Response data or error information
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
        
        # Get or create conversation with the recipient
        convo_response = dm.get_convo_for_members({
            'members': [recipient_did]
        })
        
        convo_id = convo_response.convo.id
        
        # Send the message
        message_response = dm.send_message({
            'convo_id': convo_id,
            'message': {
                'text': message_text
            }
        })
        
        return {
            'success': True,
            'convo_id': convo_id,
            'message_id': message_response.id,
            'sent_at': message_response.sent_at
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def main():
    """Main function to handle command line arguments"""
    if len(sys.argv) != 3:
        print(json.dumps({
            'success': False, 
            'error': 'Usage: python bluesky_dm.py <recipient_did> <message_text>'
        }))
        sys.exit(1)
    
    recipient_did = sys.argv[1]
    message_text = sys.argv[2]
    
    result = send_direct_message(recipient_did, message_text)
    print(json.dumps(result))
    
    # Exit with appropriate code
    sys.exit(0 if result['success'] else 1)

if __name__ == '__main__':
    main()