"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.blueskyToGenesys = void 0;
const api_1 = require("@atproto/api");
const blueskyToGenesys = (agent, postView) => __awaiter(void 0, void 0, void 0, function* () {
    if (!api_1.AppBskyFeedPost.isRecord(postView.record)) {
        throw new Error('Invalid post record');
    }
    const from = {
        nickname: postView.author.handle,
        id: postView.author.did,
        idType: 'Opaque',
        image: postView.author.avatar,
        firstName: postView.author.displayName,
    };
    // Only include lastName if we have a meaningful value
    // For consistency with external contact creation, we omit empty fields
    const record = postView.record;
    const message = {
        channel: {
            messageId: postView.uri,
            from: from,
            time: postView.indexedAt,
            publicMetadata: record.reply ? {
                rootId: record.reply.root.uri,
                replyToId: record.reply.parent.uri,
            } : {
                rootId: postView.uri, // For non-reply posts, root is the post itself
                // replyToId omitted for non-reply posts
            }
        },
        text: record.text,
    };
    if (postView.embed) {
        if (api_1.AppBskyEmbedImages.isView(postView.embed)) {
            message.content = postView.embed.images.map(image => ({
                contentType: 'Attachment',
                attachment: {
                    mediaType: 'Image',
                    url: image.fullsize,
                    mime: 'image/jpeg', // This is a guess, we may need to get the mime type from the blob
                    filename: image.alt || 'image.jpg',
                }
            }));
        }
        else if (api_1.AppBskyEmbedRecord.isView(postView.embed)) {
            const record = postView.embed.record;
            if (api_1.AppBskyEmbedRecord.isViewRecord(record)) {
                const quotePost = record.value;
                message.text += `\n\n[Quote Post by @${record.author.handle}]\n${quotePost.text}`;
            }
        }
        else if (api_1.AppBskyEmbedExternal.isView(postView.embed)) {
            const external = postView.embed.external;
            message.text += `\n\n[External Link]\nTitle: ${external.title}\nDescription: ${external.description}\nURL: ${external.uri}`;
        }
    }
    return message;
});
exports.blueskyToGenesys = blueskyToGenesys;
