import { VOICE, SYSTEM_MESSAGE } from '../config/constants.js';

export function sendSessionUpdate(ws) {
    const sessionUpdate = {
        type: "session.update",
        session: {
            turn_detection: {
                type: "server_vad",
                threshold: 0.3,
                silence_duration_ms: 1000,
            },
            input_audio_format: "g711_ulaw",
            output_audio_format: "g711_ulaw",
            voice: VOICE,
            instructions: `${SYSTEM_MESSAGE}
- When confirming the user's email address, repeat it back to them and ask for confirmation.
- Only trigger email retrieval and confirmation when scheduling a training session.
- When handling investment confirmations, ask for user affirmation before redirecting to a fundraising expert.`,
            tools: [
                {
                    type: "function",
                    name: "access_knowledge_base",
                    description: "Access the knowledge base to answer the user's question.",
                    parameters: {
                        type: "object",
                        properties: {
                            question: {
                                type: "string",
                                description: "The question to ask the knowledge base.",
                            },
                        },
                        required: ["question"],
                        additionalProperties: false,
                    },
                },
                {
                    type: "function",
                    name: "schedule_training_session",
                    description: "Schedule a training session for the user by collecting necessary details such as time and email.",
                    parameters: {
                        type: "object",
                        properties: {
                            preferred_time: {
                                type: "string",
                                description: "The preferred time for the training session in ISO 8601 format.",
                            },
                            email: {
                                type: "string",
                                description: "The user's email address to send meeting details.",
                            },
                        },
                        required: ["preferred_time", "email"],
                        additionalProperties: false,
                    },
                },
                {
                    type: "function",
                    name: "retrieve_user_email",
                    description: "Retrieve the user's email address.",
                    parameters: {
                        type: "object",
                        properties: {},
                        additionalProperties: false,
                    },
                },
                {
                    type: "function",
                    name: "handle_investment_query",
                    description: "Handle investment inquiries by offering to connect the caller to a fundraising expert.",
                    parameters: {
                        type: "object",
                        properties: {},
                        additionalProperties: false,
                    },
                },
                {
                    type: "function",
                    name: "access_long_term_memory",
                    description: "Retrieve relevant long-term memory information for the user based on the current context.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: {
                                type: "string",
                                description: "The user's current message to query against long-term memory.",
                            },
                        },
                        required: ["query"],
                        additionalProperties: false,
                    },
                },
            ],
            modalities: ["text", "audio"],
            temperature: 0.7,
            input_audio_transcription: {
                model: "whisper-1",
            },
        },
    };
    console.log("Sending session update:", JSON.stringify(sessionUpdate));
    ws.send(JSON.stringify(sessionUpdate));
}