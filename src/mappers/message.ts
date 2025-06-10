import { AppBskyFeedDefs, AppBskyFeedPost, BskyAgent, AppBskyEmbedImages, AppBskyEmbedRecord, AppBskyEmbedExternal } from '@atproto/api';

// This is a placeholder for the full Genesys Cloud message format.
// We will expand on this later.
export interface GenesysCloudMessage {
    channel: {
        messageId: string;
        from: {
            nickname: string;
            id: string;
            idType: string;
            image?: string;
            firstName?: string;
            lastName?: string;
        };
        time: string;
        publicMetadata: {
            rootId: string;
            replyToId?: string;  // Optional only for non-reply posts
        };
    };
    text: string;
    content?: any[]; // Simplified for now
}


export const blueskyToGenesys = async (
    agent: BskyAgent,
    postView: AppBskyFeedDefs.PostView,
): Promise<GenesysCloudMessage> => {

    if (!AppBskyFeedPost.isRecord(postView.record)) {
        throw new Error('Invalid post record');
    }

    const from: any = {
        nickname: postView.author.handle,
        id: postView.author.did,
        idType: 'Opaque',
        image: postView.author.avatar,
        firstName: postView.author.displayName,
    };
    
    // Only include lastName if we have a meaningful value
    // For consistency with external contact creation, we omit empty fields

    const record = postView.record as AppBskyFeedPost.Record;

    const message: GenesysCloudMessage = {
        channel: {
            messageId: postView.uri,
            from: from,
            time: postView.indexedAt,
            publicMetadata: record.reply ? {
                rootId: record.reply.root.uri,
                replyToId: record.reply.parent.uri,
            } : {
                rootId: postView.uri,  // For non-reply posts, root is the post itself
                // replyToId omitted for non-reply posts
            }
        },
        text: record.text,
    };

    if (postView.embed) {
        if (AppBskyEmbedImages.isView(postView.embed)) {
            message.content = postView.embed.images.map(image => ({
                contentType: 'Attachment',
                attachment: {
                    mediaType: 'Image',
                    url: image.fullsize,
                    mime: 'image/jpeg', // This is a guess, we may need to get the mime type from the blob
                    filename: image.alt || 'image.jpg',
                }
            }));
        } else if (AppBskyEmbedRecord.isView(postView.embed)) {
            const record = postView.embed.record;
            if (AppBskyEmbedRecord.isViewRecord(record)) {
                const quotePost = record.value as AppBskyFeedPost.Record;
                message.text += `\n\n[Quote Post by @${record.author.handle}]\n${quotePost.text}`;
            }
        } else if (AppBskyEmbedExternal.isView(postView.embed)) {
            const external = postView.embed.external;
            message.text += `\n\n[External Link]\nTitle: ${external.title}\nDescription: ${external.description}\nURL: ${external.uri}`;
        }
    }

    return message;
}; 