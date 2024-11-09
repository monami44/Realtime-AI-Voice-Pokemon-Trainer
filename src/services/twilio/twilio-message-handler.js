import { finalizeConversation } from '../../utils/finalize-conversation.js';
import WebSocket from "ws";

export function handleTwilioMessage(message, openAiWs, setStreamSid, setCallSid) {
    try {
        const data = JSON.parse(message);

        switch (data.event) {
            case "media":
                if (openAiWs.readyState === WebSocket.OPEN) {
                    const audioAppend = {
                        type: "input_audio_buffer.append",
                        audio: data.media.payload,
                    };
                    openAiWs.send(JSON.stringify(audioAppend));
                }
                break;
            case "start":
                setStreamSid(data.start.streamSid);
                setCallSid(data.start.callSid);
                openAiWs.callSid = data.start.callSid;
                console.log("Incoming stream started:", data.start.streamSid);
                console.log("Call SID:", data.start.callSid);
                break;
            case "stop":
                console.log("Call ended");
                finalizeConversation(openAiWs);
                break;
            default:
                console.log("Received non-media event:", data.event);
                break;
        }
    } catch (error) {
        console.error("Error parsing Twilio message:", error);
    }
} 