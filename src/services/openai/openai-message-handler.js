import { VOICE, LOG_EVENT_TYPES } from '../../config/constants.js';
import { askSupabaseAssistant } from '../../handlers/ask-knowledge.js';
import { 
    askForSuitableTime,
    handleEmailConfirmation,
    handleExistingEmailConfirmation,
    askForEmail,
    bookTrainingSession,
    confirmEmail
} from '../google/booking.js';
import { 
    parseUserTime,
    isAffirmative,
    sanitizeInput,
    isRelevantTopic,
    updateLastConversation,
    reconstructEmail,
    validateEmail,
    spellOutEmail
} from '../../utils/utils.js';
import { process_investment_confirmation } from '../../handlers/investment-handling.js';
import { updateBookingStateWithRetry } from '../../utils/retry.js';
import { handleIncomingCall } from '../../handlers/first-message.js';
import { sendSessionUpdate } from '../../utils/session-update.js';
import { 
    getRelevantLongTermMemory,
} from '../../database/long-term-memory.js';
import { redirectToFundraisingExpert } from '../../handlers/investment-handling.js';
import { retrieveUserEmail } from '../../utils/finalize-conversation.js';

export async function handleOpenAiMessage(openAiWs, data, connection, streamSid) {
    try {
        const response = JSON.parse(data);

        if (response.type === "session.created") {
            console.log("Session created:", response);
            sendSessionUpdate(openAiWs);
        }

        if (response.type === "session.updated") {
            console.log("Session updated successfully:", response);
            openAiWs.sessionReady = true;
            if (openAiWs.callSid) {
                await handleIncomingCall(openAiWs.callSid, openAiWs);
            } else {
                console.log("Call SID not set, waiting for incoming call");
            }
        }

        // Handle 'input_audio_buffer.speech_started' event to interrupt AI speech
        if (response.type === "input_audio_buffer.speech_started") {
            console.log("Speech Start:", response.type);
            // Clear any ongoing speech on Twilio side
            connection.send(
                JSON.stringify({
                    streamSid: streamSid,
                    event: "clear",
                }),
            );
            console.log("Cancelling AI speech from the server");

            // Send interrupt message to OpenAI to cancel ongoing response
            const interruptMessage = {
                type: "response.cancel",
            };
            openAiWs.send(JSON.stringify(interruptMessage));
        }

        if (LOG_EVENT_TYPES.includes(response.type)) {
            console.log(`Received event: ${response.type}`, response);
        }

        if (response.type === "response.function_call_arguments.done") {
            console.log("Function called successfully:", response);

            const functionName = response.name;

            // Block unwanted function calls based on state
            if (openAiWs.bookingState === 'awaiting_investment_confirmation' && functionName === "handle_investment_query") {
                console.warn("Ignoring 'handle_investment_query' call during 'awaiting_investment_confirmation' state.");
                return;
            }

            if (functionName === "access_knowledge_base") {
                // Existing logic for accessing knowledge base
                const functionArgs = JSON.parse(response.arguments);
                const question = functionArgs.question;

                console.log("AI is accessing knowledge base for question:", question);

                // Inform the user that the assistant is checking the knowledge base
                const checkingMessage = "Give me a second, I'm checking my knowledge.";
                openAiWs.send(
                    JSON.stringify({
                        type: "conversation.item.create",
                        item: {
                            type: "assistant",
                            content: checkingMessage,
                            modalities: ["text", "audio"],
                        },
                    }),
                );

                // Append AI's intermediate message to fullDialogue
                openAiWs.fullDialogue += `AI: ${checkingMessage}\n`;

                // Call the Supabase assistant
                const answer = await askSupabaseAssistant(question);

                if (answer) {
                    console.log("Sending knowledge base answer to OpenAI:", answer);
                    openAiWs.send(
                        JSON.stringify({
                            type: "conversation.item.create",
                            item: {
                                type: "function_call_output",
                                output: answer,
                            },
                        }),
                    );

                    openAiWs.send(
                        JSON.stringify({
                            type: "response.create",
                            response: {
                                modalities: ["text", "audio"],
                                instructions: `Based on the knowledge base, provide a concise summary of the following information: ${answer}`,
                                voice: VOICE,
                                temperature: 0.7,
                                max_output_tokens: 150,
                            },
                        }),
                    );

                    console.log("Knowledge base answer provided to OpenAI");

                    // **Do NOT append function call outputs**
                    // openAiWs.fullDialogue += `AI: ${answer}\n`;

                    // Set flag to skip appending function call outputs
                    openAiWs.sendingFunctionCallOutput = true;
                } else {
                    console.log("No answer from knowledge base, AI will use its general knowledge.");
                    // Handle the case where the Supabase query failed
                    const fallbackMessage = "I'm sorry, I couldn't access the knowledge base at this time.";
                    openAiWs.send(
                        JSON.stringify({
                            type: "conversation.item.create",
                            item: {
                                type: "assistant",
                                content: fallbackMessage,
                                modalities: ["text", "audio"],
                            },
                        }),
                    );

                    // Append fallback message to fullDialogue
                    openAiWs.fullDialogue += `AI: ${fallbackMessage}\n`;
                }
            }

            if (functionName === "schedule_training_session") {
                // Handle scheduling logic
                const functionArgs = JSON.parse(response.arguments);
                const preferredTime = functionArgs.preferred_time;
                const email = functionArgs.email;

                console.log("Scheduling training session for:", preferredTime, email);

                // Proceed to schedule the session using Google Calendar API
                const bookingSuccess = await bookTrainingSession(openAiWs, preferredTime, email);

                if (bookingSuccess) {
                    const prompt = "Your training session has been booked successfully! I've sent the meeting details to your email. Looking forward to your training session!";
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
                } else {
                    const prompt = "I'm sorry, I encountered an issue while booking your training session. Please try again later.";
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
                }
            }

            if (functionName === "retrieve_user_email") {
                console.log("AI is requesting user email.");
                const phoneNumber = openAiWs.phoneNumber;
                const email = await retrieveUserEmail(phoneNumber);
                if (email) {
                    console.log(`Sending email confirmation prompt to AI for phone number: ${phoneNumber} with email: ${email}`);
                    
                    // Send the email back to the AI as a function_call_output with modalities
                    openAiWs.send(JSON.stringify({
                        type: "conversation.item.create",
                        item: {
                            type: "function_call_output",
                            output: email,
                            modalities: ["text", "audio"],
                        },
                    }));
                    
                    // Send a prompt to confirm the email audibly
                    openAiWs.send(JSON.stringify({
                        type: "response.create",
                        response: {
                            modalities: ["text", "audio"],
                            instructions: `Your email address is ${spellOutEmail(email)}. Is that correct? Please say "yes" or "no".`,
                            voice: VOICE,
                            temperature: 0.7,
                            max_output_tokens: 150,
                        },
                    }));
                    
                    // Append the confirmation prompt to the dialogue
                    openAiWs.fullDialogue += `AI: Your email address is ${spellOutEmail(email)}. Is that correct?\n`;
                } else {
                    console.log(`No email found for phone number: ${phoneNumber}`);
                    openAiWs.send(JSON.stringify({
                        type: "conversation.item.create",
                        item: {
                            type: "function_call_output",
                            output: "No email found for the user.",
                            modalities: ["text", "audio"],
                        },
                    }));
                    
                    // Prompt the user to provide their email audibly
                    openAiWs.send(JSON.stringify({
                        type: "response.create",
                        response: {
                            modalities: ["text", "audio"],
                            instructions: "I couldn't find a stored email address for you. Could you please provide your email address? I'll confirm it with you before scheduling the training session.",
                            voice: VOICE,
                            temperature: 0.7,
                            max_output_tokens: 150,
                        },
                    }));
                    
                    // Append the prompt to the dialogue
                    openAiWs.fullDialogue += `AI: I couldn't find a stored email address for you. Could you please provide your email address? I'll confirm it with you before scheduling the training session.\n`;
                }
            }

            if (functionName === "handle_investment_query") {
                console.log("Handling investment inquiry.");
                const prompt = "It's an honor that you're interested in investing. To discuss this further, I will need to forward you to our fundraising expert. Would you like me to connect you now?";
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
                openAiWs.bookingState = 'awaiting_investment_confirmation';
                await updateBookingStateWithRetry(openAiWs.phoneNumber, 'awaiting_investment_confirmation');
            }

            if (functionName === "access_long_term_memory") {
                const functionArgs = JSON.parse(response.arguments);
                const query = functionArgs.query;
                
                console.log("Accessing long-term memory for query:", query);
                
                const memories = await getRelevantLongTermMemory(openAiWs.phoneNumber, query);
                
                if (memories && memories.length > 0) {
                    // Send memories back to AI as function call output
                    openAiWs.send(JSON.stringify({
                        type: "conversation.item.create",
                        item: {
                            type: "function_call_output",
                            output: JSON.stringify({ memories: memories }),
                        },
                    }));

                    // Let AI process the memories and respond
                    openAiWs.send(JSON.stringify({
                        type: "response.create",
                        response: {
                            modalities: ["text", "audio"],
                            instructions: `Based on the retrieved memories: ${memories.join('. ')}, provide a natural response to the user's question about their information. If no relevant information was found, politely inform the user and ask for the information.`,
                            voice: VOICE,
                            temperature: 0.7,
                            max_output_tokens: 150,
                        },
                    }));
                } else {
                    // If no memories found, let AI handle the empty response
                    openAiWs.send(JSON.stringify({
                        type: "conversation.item.create",
                        item: {
                            type: "function_call_output",
                            output: JSON.stringify({ memories: [] }),
                        },
                    }));

                    // Let AI handle the case where no memories were found
                    openAiWs.send(JSON.stringify({
                        type: "response.create",
                        response: {
                            modalities: ["text", "audio"],
                            instructions: "No memories were found. Please provide a polite response asking the user for this information.",
                            voice: VOICE,
                            temperature: 0.7,
                            max_output_tokens: 150,
                        },
                    }));
                }
            }
        }

        if (response.type === "response.audio.delta" && response.delta) {
            // Send audio delta as-is
            const audioDelta = {
                event: "media",
                streamSid: streamSid,
                media: {
                    payload: response.delta,
                },
            };
            connection.send(JSON.stringify(audioDelta));
        }

        if (response.type === "response.content.done") {
            if (!openAiWs.sendingFunctionCallOutput) {
                console.log("AI final response:", response.content);
                openAiWs.fullDialogue += `AI: ${response.content}\n`;

                // Update last conversation
                await updateLastConversation(openAiWs, openAiWs.phoneNumber, openAiWs.lastUserMessage, response.content);

                // Handle booking flow based on booking_state
                const bookingState = openAiWs.bookingState;
                if (bookingState === 'idle') {
                    if (response.content.toLowerCase().includes('training session') || 
                        response.content.toLowerCase().includes('book a training') || 
                        response.content.toLowerCase().includes('schedule a training')) {
                        await askForSuitableTime(openAiWs);
                    }
                } else if (bookingState === 'awaiting_time') {
                    // Handle time input
                    const parsedTime = parseUserTime(response.content);
                    if (parsedTime) {
                        openAiWs.preferred_time = parsedTime;
                        await updateBookingStateWithRetry(openAiWs.phoneNumber, 'awaiting_email');
                        await askForEmail(openAiWs);
                    } else {
                        const prompt = "I'm sorry, I couldn't understand the time you provided. Could you please specify a different time that suits you?";
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
                    }
                } else if (bookingState === 'confirm_email' || bookingState === 'confirm_existing_email') {
                    // Handle email confirmation
                    const confirmation = response.content.trim().toLowerCase();
                    const email = openAiWs.email;
                    await handleEmailConfirmation(openAiWs, confirmation, email);
                } else if (bookingState === 'awaiting_investment_confirmation') {
                    const confirmation = response.content.trim().toLowerCase();
                    console.log(`Investment confirmation handling: Received confirmation="${confirmation}"`);
                    await process_investment_confirmation(openAiWs, confirmation);
                }
            } else {
                console.log("Skipping appending AI function call output to fullDialogue");
                openAiWs.sendingFunctionCallOutput = false; // Reset the flag
            }
        }

        // **Handle AI's Transcribed Responses**
        if (response.type === "response.audio_transcript.done") {
            console.log("AI transcription completed:", response.transcript);
            const aiTranscribedText = response.transcript;

            // Append AI's transcribed message to fullDialogue
            openAiWs.fullDialogue += `AI: ${aiTranscribedText}\n`;
            console.log("AI message from transcription:", aiTranscribedText);

            // Update last conversation
            await updateLastConversation(openAiWs, openAiWs.phoneNumber, openAiWs.lastUserMessage, aiTranscribedText);
        }

        // **Handle Transcription Completion Event for User Messages**
        if (response.type === "conversation.item.input_audio_transcription.completed") {
            console.log("Transcription completed:", response.transcript);
            const transcribedText = response.transcript;

            // Sanitize and validate User message
            if (transcribedText && transcribedText.trim() !== "") {
                const sanitizedText = sanitizeInput(transcribedText);
                
                // Handle investment confirmation BEFORE other state handling
                if (openAiWs.bookingState === 'awaiting_investment_confirmation') {
                    const confirmation = sanitizedText.trim().toLowerCase();
                    if (isAffirmative(confirmation)) {
                        try {
                            await redirectToFundraisingExpert(openAiWs.callSid);
                            return; // Exit early after redirect
                        } catch (error) {
                            console.error("Error during redirect:", error);
                            // Handle error...
                        }
                    }
                }

                // Check for relevant topics before state handling
                if (isRelevantTopic(sanitizedText)) {
                    const memories = await getRelevantLongTermMemory(openAiWs.phoneNumber, sanitizedText);
                    if (memories.length > 0) {
                        const enhancedPrompt = `The user said: "${sanitizedText}". Based on previous conversations, I remember: ${memories.join('. ')}. Please incorporate this information naturally into your response if relevant.`;
                        openAiWs.send(JSON.stringify({
                            type: "response.create",
                            response: {
                                modalities: ["text", "audio"],
                                instructions: enhancedPrompt,
                                voice: VOICE,
                                temperature: 0.7,
                                max_output_tokens: 150,
                            },
                        }));
                    }
                }

                console.log("Appending User message:", sanitizedText);
                openAiWs.fullDialogue += `User: ${sanitizedText}\n`;
                openAiWs.lastUserMessage = sanitizedText;
            } else {
                console.log("Received empty or invalid User message. Skipping append.");
            }

            // Proceed with handling the User message based on booking_state
            const bookingState = openAiWs.bookingState;
            if (bookingState === 'awaiting_time') {
                const parsedTime = parseUserTime(transcribedText);
                if (parsedTime) {
                    openAiWs.preferred_time = parsedTime;
                    await updateBookingStateWithRetry(openAiWs.phoneNumber, 'awaiting_email');
                    await askForEmail(openAiWs);
                } else {
                    const prompt = "I'm sorry, I couldn't understand the time you provided. Could you please specify a different time that suits you?";
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
                    console.log("Appended AI prompt for time clarification to fullDialogue:", `AI: ${prompt}`);
                }
            } else if (bookingState === 'awaiting_email') {
                // Handle email input
                const email = reconstructEmail(transcribedText);
                if (validateEmail(email)) {
                    openAiWs.email = email; // Store the user's email
                    await updateBookingStateWithRetry(openAiWs.phoneNumber, 'confirm_email');
                    await confirmEmail(openAiWs, email);
                } else {
                    const prompt = "The email address you provided doesn't seem to be valid. Could you please spell it out again?";
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
                    console.log("Appended AI prompt for email re-entry to fullDialogue:", `AI: ${prompt}`);
                }
            } else if (bookingState === 'confirm_email') {
                // Capture confirmation response
                const confirmation = transcribedText.trim().toLowerCase();
                const email = openAiWs.email;
                await handleEmailConfirmation(openAiWs, confirmation, email);
            } else if (bookingState === 'confirm_existing_email') {
                const confirmation = transcribedText.trim().toLowerCase();
                await handleExistingEmailConfirmation(openAiWs, confirmation);
            } else if (bookingState === 'awaiting_investment_confirmation') {
                const confirmation = transcribedText.trim().toLowerCase();
                await process_investment_confirmation(confirmation);
                return; // Exit early after handling investment confirmation
            }

            // Update last conversation
            await updateLastConversation(openAiWs, openAiWs.phoneNumber, openAiWs.lastUserMessage, null);
        }

    } catch (error) {
        console.error(
            "Error processing OpenAI message:",
            error,
            "Raw message:",
            data,
        );
    }
}