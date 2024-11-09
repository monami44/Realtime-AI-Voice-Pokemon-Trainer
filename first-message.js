import { 
    createOrGetUserWithRetry, 
    createConversationWithRetry, 
    getLastConversationWithRetry 
} from './retry.js';
import { summarizeLastTopic } from './utils.js';
import { 
    VOICE, 
    RETURNING_USER_MESSAGE_TEMPLATE, 
    NEW_USER_PROMPT 
} from './constants.js';
import twilio from 'twilio';

// Initialize Twilio client
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * Handles the initial setup and message for an incoming call
 */
export async function handleIncomingCall(callSid, openAiWs) {
    if (!callSid) {
        console.error("Call SID is undefined");
        return;
    }

    try {
        // Fetch call details from Twilio API
        const call = await twilioClient.calls(callSid).fetch();
        const phoneNumber = call.from;

        // Store the phone number
        openAiWs.phoneNumber = phoneNumber;

        // Create or get user with retry
        const user = await createOrGetUserWithRetry(phoneNumber);
        if (!user) {
            throw new Error("Failed to create or get user");
        }

        // Create new conversation with conversation_id set to callSid
        const conversation = await createConversationWithRetry(phoneNumber, callSid);
        if (!conversation) {
            throw new Error("Failed to create conversation");
        }
        openAiWs.conversationId = conversation.conversation_id;

        console.log(`Handling incoming call from ${phoneNumber} with Call SID: ${callSid}`);

        // Get last conversation for context, excluding finalized ones
        const lastConversation = await getLastConversationWithRetry(phoneNumber);
        console.log("Last conversation data:", lastConversation);
        console.log("User details:", user);

        let prompt;
        if (user.name) {
            // Check if the last conversation is finalized
            if (lastConversation && lastConversation.booking_state !== 'idle') {
                const lastTopic = lastConversation?.summary 
                    ? summarizeLastTopic(lastConversation.summary)
                    : "our introduction";
                
                prompt = RETURNING_USER_MESSAGE_TEMPLATE
                    .replace('{name}', user.name)
                    .replace('{lastTopic}', lastTopic);
            } else {
                // Conversation is finalized or no relevant last conversation
                prompt = "Hello! Welcome back. How can I assist you today?";
            }
            console.log("Generated prompt:", prompt);
            sendUserMessage(openAiWs, prompt, true);
        } else {
            prompt = NEW_USER_PROMPT;
            console.log("Generated new user prompt:", prompt);
            sendUserMessage(openAiWs, prompt);
        }

    } catch (error) {
        console.error("Error handling incoming call:", error);
    }
}

/**
 * Sends the initial greeting as a user message
 */
export function sendUserMessage(openAiWs, prompt, isReturningUser = false) {
    console.log("Sending AI prompt:", prompt);
    openAiWs.send(JSON.stringify({
        type: "response.create",
        response: {
            modalities: ["text", "audio"],
            instructions: prompt,
            voice: VOICE,
            temperature: 0.7,
            max_output_tokens: 300,
        },
    }));

    // We don't append anything to fullDialogue here, as we're waiting for the AI's response
} 