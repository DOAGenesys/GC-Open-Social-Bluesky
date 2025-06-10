#!/usr/bin/env python3
"""
Bluesky Direct Message Polling Service
Polls for new direct messages from Bluesky conversations
"""

import sys
import json
import os
from atproto import Client
from datetime import datetime, timezone

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
        
        # Create client and login
        client = Client()
        client.login(username, password)
        
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