#!/usr/bin/env python3
"""
Bluesky Direct Message Handler
Handles direct messaging functionality using the Python atproto SDK
"""

import sys
import json
import os
from atproto import Client

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
        
        # Create client and login
        client = Client()
        client.login(username, password)
        
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