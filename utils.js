import * as chrono from 'chrono-node';
import { finalizeConversation } from './finalize-conversation.js';
import { updateConversationWithRetry } from './retry.js';

/**
 * Email-related utility functions
 */
export function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

export function spellOutEmail(email) {
    return email.split('').join(' ');
}

export function reconstructEmail(spelledOutEmail) {
    let email = spelledOutEmail.toLowerCase();
    email = email.replace(/\bat\b/g, '@').replace(/\bdot\b/g, '.').replace(/\s+/g, '');
    return email;
}

/**
 * Time-related utility functions
 */
export function parseUserTime(userInput) {
    const parsedDate = chrono.parseDate(userInput);
    if (parsedDate) {
        return parsedDate.toISOString();
    } else {
        return null;
    }
}

/**
 * Conversation and text processing utilities
 */
export function sanitizeInput(input) {
    return input.replace(/[\n\r]/g, ' ').trim();
}

export function summarizeLastTopic(summary) {
    let cleanSummary = summary
        .replace(/^The user |^User |^The AI |^AI /, '')
        .replace(/asked (about|for) /, '')
        .replace(/^The conversation was about /, '');

    const mainTopic = cleanSummary.split('.')[0].trim();
    
    if (mainTopic.length > 50) {
        return mainTopic.substring(0, 47) + '...';
    }
    
    return mainTopic;
}

export function isRelevantTopic(text) {
    const relevantKeywords = ['preference', 'likes', 'dislikes', 'favorite', 'history', 'previous', 'last time'];
    return relevantKeywords.some(keyword => text.toLowerCase().includes(keyword));
}

/**
 * Investment-related utilities
 */
export function isAffirmative(confirmation) {
    console.log(`isAffirmative: Processing confirmation="${confirmation}"`);
    
    const affirmativePatterns = [
        /\byes\b/i,
        /\bsure\b/i,
        /\byeah\b/i,
        /\babsolutely\b/i,
        /\bplease do\b/i,
        /\bof course\b/i,
        /\bredirect me\b/i,
        /\bconnect me\b/i,
        /\bok(ay)?\b/i,
        /\bfine\b/i,
        /\bgo ahead\b/i
    ];

    const matched = affirmativePatterns.some(pattern => {
        const isMatch = pattern.test(confirmation);
        if (isMatch) {
            console.log(`isAffirmative: Matched pattern ${pattern}`);
        }
        return isMatch;
    });

    console.log(`isAffirmative: Final result=${matched}`);
    return matched;
}

/**
 * WebSocket setup utilities
 */
export function setupWebSocketErrorHandling(ws) {
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        try {
            if (ws.conversationId) {
                updateConversation(ws.conversationId, {
                    end_timestamp: new Date().toISOString(),
                    error_log: JSON.stringify(error)
                }).catch(console.error);
            }
        } catch (e) {
            console.error('Error handling WebSocket error:', e);
        }
    });

    ws.on('close', async () => {
        try {
            if (ws.conversationId) {
                await finalizeConversation(ws);
            }
        } catch (e) {
            console.error('Error handling WebSocket close:', e);
        }
    });

    return ws;
}

/**
 * Embedding generation utility
 */
export async function generateEmbedding(text) {
    try {
        const response = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                input: text,
                model: "text-embedding-ada-002",
            }),
        });

        if (!response.ok) {
            console.error("Error fetching embedding from OpenAI:", response.statusText);
            return null;
        }

        const embeddingData = await response.json();
        return embeddingData.data[0].embedding;
    } catch (error) {
        console.error("Error in generateEmbedding:", error);
        return null;
    }
}

export async function updateLastConversation(ws, phoneNumber, question, answer) {
    if (!ws.conversationId) {
        console.error("No conversation ID available");
        return;
    }

    console.log(`Updating conversation for ${phoneNumber}`);
    console.log(`Question: ${question}`);
    console.log(`Answer: ${answer}`);
    
    await updateConversationWithRetry(ws.conversationId, {
        last_question: question || 'No question',
        last_answer: answer
    });
}