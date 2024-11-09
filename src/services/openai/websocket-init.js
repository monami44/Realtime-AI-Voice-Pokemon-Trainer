import WebSocket from "ws";
import { setupWebSocketErrorHandling } from '../../utils/utils.js';

export function initializeOpenAiWebSocket() {
    const ws = new WebSocket(
        process.env.AZURE_OPENAI_REALTIME_ENDPOINT,
        {
            headers: {
                "api-key": process.env.AZURE_OPENAI_REALTIME_API_KEY,
            },
        },
    );
    
    // Add base properties
    ws.fullDialogue = "";
    ws.awaitingName = true;
    ws.phoneNumber = null;
    ws.lastUserMessage = null;
    ws.conversationId = null;
    ws.sessionReady = false;
    ws.sendingFunctionCallOutput = false;
    ws.bookingState = 'idle';
    ws.preferred_time = null;
    ws.email = null;

    return setupWebSocketErrorHandling(ws);
} 