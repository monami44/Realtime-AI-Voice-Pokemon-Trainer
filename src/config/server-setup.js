import fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import { initializeOpenAiWebSocket } from '../services/openai/websocket-init.js';
import { handleOpenAiMessage } from '../services/openai/openai-message-handler.js';
import { handleTwilioMessage } from '../services/twilio/twilio-message-handler.js';
import { sendSessionUpdate } from '../utils/session-update.js';
import { handleCallStatus } from '../handlers/investment-handling.js';
import WebSocket from "ws";

export function setupServer() {
    const fastifyInstance = fastify({ logger: true });
    fastifyInstance.register(fastifyWebsocket);

    // Routes
    fastifyInstance.get("/", async (_, reply) =>
        reply.send({ message: "AI Assistant With a Brain is Alive!" }),
    );

    fastifyInstance.all("/incoming-call", async (request, reply) => {
        const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Connect>
                    <Stream url="wss://${request.headers.host}/media-stream" />
                </Connect>
            </Response>`;
        reply.type("text/xml").send(twimlResponse);
    });

    // WebSocket route for media-stream
    fastifyInstance.register(async (fastifyInstance) => {
        fastifyInstance.get("/media-stream", { websocket: true }, (connection, _) => {
            console.log("Client connected");
            const openAiWs = initializeOpenAiWebSocket();
            let streamSid = null;
            let callSid = null;

            openAiWs.on("open", () => {
                console.log("Connected to OpenAI Realtime API");
                setTimeout(() => sendSessionUpdate(openAiWs), 250);
            });

            openAiWs.on("message", (data) =>
                handleOpenAiMessage(openAiWs, data, connection, streamSid),
            );

            connection.on("message", (message) =>
                handleTwilioMessage(message, openAiWs, (sid) => { streamSid = sid; }, (cid) => { callSid = cid; })
            );

            connection.on("close", () => {
                if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
                console.log("Client disconnected.");
            });

            openAiWs.on("close", () =>
                console.log("Disconnected from OpenAI Realtime API"),
            );
            openAiWs.on("error", (error) =>
                console.error("OpenAI WebSocket error:", error),
            );
        });
    });

    // Call status route
    fastifyInstance.post('/call-status', handleCallStatus);

    return fastifyInstance;
} 