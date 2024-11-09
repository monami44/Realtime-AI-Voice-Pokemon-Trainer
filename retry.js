import { RETRY_OPTIONS } from './constants.js';
import {
    dbCreateOrGetUser,
    dbUpdateUserName,
    dbUpdateUserEmail,
    dbCreateConversation,
    dbUpdateConversation,
    dbFinalizeConversation,
    dbGetLastConversation,
    dbCreateBooking,
    dbUpdateBookingState,
    dbGetUserEmail
} from './database-utils.js';

/**
 * Generic retry function with exponential backoff
 */
export async function withRetry(operation, options = RETRY_OPTIONS) {
    let lastError;
    for (let i = 0; i < options.maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            console.error(`Operation failed (attempt ${i + 1}/${options.maxRetries}):`, error);
            
            if (i < options.maxRetries - 1) {
                const delay = Math.min(
                    options.baseDelay * Math.pow(2, i),
                    options.maxDelay
                );
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}

// Retry-enabled versions of database functions
export const createOrGetUserWithRetry = (phoneNumber) => 
    withRetry(() => dbCreateOrGetUser(phoneNumber));

export const updateUserNameWithRetry = (phoneNumber, name) => 
    withRetry(() => dbUpdateUserName(phoneNumber, name));

export const updateUserEmailWithRetry = (phoneNumber, email) => 
    withRetry(() => dbUpdateUserEmail(phoneNumber, email));

export const createConversationWithRetry = (phoneNumber, callSid) => 
    withRetry(() => dbCreateConversation(phoneNumber, callSid));

export const updateConversationWithRetry = (conversationId, updates) => 
    withRetry(() => dbUpdateConversation(conversationId, updates));

export const finalizeConversationInDbWithRetry = (conversationId, fullDialogue, summary) => 
    withRetry(() => dbFinalizeConversation(conversationId, fullDialogue, summary));

export const getLastConversationWithRetry = (phoneNumber) => 
    withRetry(() => dbGetLastConversation(phoneNumber));

export const createBookingWithRetry = (phoneNumber, conversationId, eventId, time, email) => 
    withRetry(() => dbCreateBooking(phoneNumber, conversationId, eventId, time, email));

export const updateBookingStateWithRetry = (phoneNumber, state) => 
    withRetry(() => dbUpdateBookingState(phoneNumber, state));

export const getUserEmailWithRetry = (phoneNumber) => 
    withRetry(() => dbGetUserEmail(phoneNumber)); 