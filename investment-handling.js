import { twilioClient, VoiceResponse } from './twilio-client.js';
import { isAffirmative } from './utils.js';
import { updateBookingStateWithRetry } from './retry.js';


export async function redirectToFundraisingExpert(callSid) {
    if (!callSid) {
        console.error('redirectToFundraisingExpert: Call SID is missing.');
        throw new Error('Call SID is required for redirection');
    }

    try {
        console.log(`redirectToFundraisingExpert: Initiating redirect for Call SID: ${callSid}`);

        const twiml = new VoiceResponse();
        twiml.say({
            voice: 'alice'
        }, "Connecting you to our fundraising expert now.");
        
        twiml.dial({
            action: 'https://5e1b-185-134-138-229.ngrok-free.app/call-status',
            method: 'POST',
            timeout: 30,
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
            statusCallback: 'https://5e1b-185-134-138-229.ngrok-free.app/call-status',
            statusCallbackMethod: 'POST'
        }, '+491774709974');

        const twimlString = twiml.toString();
        console.log(`redirectToFundraisingExpert: Generated TwiML: ${twimlString}`);

        const updatedCall = await twilioClient.calls(callSid)
            .update({
                twiml: twimlString
            });

        if (!updatedCall) {
            throw new Error('Failed to update call with redirection TwiML');
        }

        console.log(`redirectToFundraisingExpert: Call updated successfully:`, updatedCall);
        return true;
    } catch (error) {
        console.error(`redirectToFundraisingExpert: Error:`, error);
        throw error;
    }
}

export async function process_investment_confirmation(openAiWs, confirmation) {
    console.log(`Processing investment confirmation. Confirmation: "${confirmation}"`);
    
    if (isAffirmative(confirmation)) {
        console.log("Affirmative confirmation detected. Initiating redirection.");
        try {
            const successPrompt = "Thank you for your interest! I'm connecting you to our fundraising expert now. Please hold on for a moment.";
            openAiWs.send(JSON.stringify({
                type: "response.create",
                response: {
                    modalities: ["text", "audio"],
                    instructions: successPrompt,
                    voice: VOICE,
                    temperature: 0.7,
                    max_output_tokens: 150,
                },
            }));
            
            openAiWs.fullDialogue += `AI: ${successPrompt}\n`;
            console.log("Success prompt sent to user.");

            // Update state before redirect
            openAiWs.bookingState = 'idle';
            await updateBookingStateWithRetry(openAiWs.phoneNumber, 'idle');
            
            // Perform redirect
            await redirectToFundraisingExpert(openAiWs.callSid);
            console.log("Redirection successful.");
            
        } catch (error) {
            console.error("Failed to redirect to fundraising expert:", error);
            
            const errorPrompt = "I apologize, but I'm having trouble connecting you to our fundraising expert. Please try again in a moment.";
            openAiWs.send(JSON.stringify({
                type: "response.create",
                response: {
                    modalities: ["text", "audio"],
                    instructions: errorPrompt,
                    voice: VOICE,
                    temperature: 0.7,
                    max_output_tokens: 150,
                },
            }));
            openAiWs.fullDialogue += `AI: ${errorPrompt}\n`;
            console.log("Redirection failed. Error prompt sent to user.");
        }
    } else {
        console.log("Non-affirmative confirmation detected.");
        const prompt = "Understood. If you have any other questions or need further assistance, feel free to ask!";
        openAiWs.send(JSON.stringify({
            type: "response.create",
            response: {
                modalities: ["text", "audio"],
                instructions: prompt,
                voice: VOICE,
                temperature: 0.7,
                max_output_tokens: 150,
            },
        }));
        openAiWs.bookingState = 'idle';
        await updateBookingStateWithRetry(openAiWs.phoneNumber, 'idle');
        openAiWs.fullDialogue += `AI: ${prompt}\n`;
        console.log("Non-affirmative response handled and state reset.");
    }
}

export function handleCallStatus(request, reply) {
    const callStatus = request.body.CallStatus;
    const callSid = request.body.CallSid;
    console.log(`Call Status Update - SID: ${callSid}, Status: ${callStatus}`);
    
    // Log additional details if available
    if (request.body.ErrorCode) {
        console.error(`Call Error - Code: ${request.body.ErrorCode}, Message: ${request.body.ErrorMessage}`);
    }
    
    reply.sendStatus(200);
} 