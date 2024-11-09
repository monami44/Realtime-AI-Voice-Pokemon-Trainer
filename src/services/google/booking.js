import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
import { VOICE } from '../../config/constants.js';
import { updateBookingStateWithRetry, createBookingWithRetry, updateUserEmailWithRetry } from '../../utils/retry.js';

// Initialize Google OAuth2 Client
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// Set Refresh Token
oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

// Initialize Google Calendar API
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

export async function askForSuitableTime(openAiWs) {
    const prompt = "Sure! I'd be happy to book a training session for you. What time would suit you best for the training session?";
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
    openAiWs.bookingState = 'awaiting_time';
    await updateBookingStateWithRetry(openAiWs.phoneNumber, 'awaiting_time');
}

export async function bookTrainingSession(openAiWs, preferredTime, email) {
    try {
        if (!preferredTime) {
            console.error("Preferred time is not set.");
            return false;
        }

        const startTime = new Date(preferredTime);
        const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

        const event = {
            summary: "Pokémon Training Session",
            description: "A training session with Marcus, the Pokémon Master.",
            start: {
                dateTime: startTime.toISOString(),
                timeZone: 'America/Los_Angeles',
            },
            end: {
                dateTime: endTime.toISOString(),
                timeZone: 'America/Los_Angeles',
            },
            attendees: [
                { email: email },
            ],
            conferenceData: {
                createRequest: {
                    requestId: uuidv4(),
                    conferenceSolutionKey: { type: "hangoutsMeet" },
                },
            },
            reminders: {
                useDefault: true,
            },
        };

        const response = await calendar.events.insert({
            calendarId: process.env.GOOGLE_CALENDAR_ID,
            resource: event,
            conferenceDataVersion: 1,
        });

        if (response.status === 200 || response.status === 201) {
            console.log("Event created:", response.data.htmlLink);
            
            const booking = await createBookingWithRetry(
                openAiWs.phoneNumber,
                openAiWs.conversationId,
                response.data.id,
                startTime.toISOString(),
                email
            );

            if (booking) {
                await updateUserEmailWithRetry(openAiWs.phoneNumber, email);
                return true;
            }
        }
        
        console.error("Failed to create event:", response.status, response.statusText);
        return false;

    } catch (error) {
        console.error("Error booking training session:", error);
        return false;
    }
}

export async function handleExistingEmailConfirmation(openAiWs, confirmation) {
    if (confirmation.includes('yes')) {
        const bookingSuccess = await bookTrainingSession(openAiWs, openAiWs.preferred_time, openAiWs.email);
        if (bookingSuccess) {
            const prompt = "Perfect! Your training session has been booked successfully! I've sent the meeting details to your email. Looking forward to your training session!";
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
    } else {
        const prompt = "No problem! Please spell out the email address you'd like to use for this booking.";
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
        openAiWs.bookingState = 'awaiting_email';
        await updateBookingStateWithRetry(openAiWs.phoneNumber, 'awaiting_email');
    }
}

export async function handleEmailConfirmation(openAiWs, confirmation, email) {
    if (confirmation.includes('yes')) {
        const bookingSuccess = await bookTrainingSession(openAiWs, openAiWs.preferred_time, email);
        if (bookingSuccess) {
            const prompt = "Great! Your training session has been booked successfully! I've sent the meeting details to your email. Looking forward to your training session!";
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
    } else {
        const prompt = "No problem. Please provide your email address so I can send you the meeting details. Please spell it out for me.";
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
        openAiWs.bookingState = 'awaiting_email';
        await updateBookingStateWithRetry(openAiWs.phoneNumber, 'awaiting_email');
    }
} 


// Function to ask user for their email address
export async function askForEmail(openAiWs) {
    try {
        const user = await createOrGetUserWithRetry(openAiWs.phoneNumber);

        if (user && user.email) {
            console.log(`Stored email found for phone number: ${openAiWs.phoneNumber}`);
            // Ask if they want to use the stored email
            const prompt = `I see that I have your email address on file (${spellOutEmail(user.email)}). Would you like me to use this email for the booking? Please say yes or no.`;
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
            openAiWs.email = user.email; // Store the existing email
            openAiWs.bookingState = 'confirm_existing_email';
            await updateBookingStateWithRetry(openAiWs.phoneNumber, 'confirm_existing_email');
        } else {
            console.log(`No stored email found for phone number: ${openAiWs.phoneNumber}`);
            // Ask for new email
            const prompt = "Please provide your email address so I can send you the meeting details. Please spell it out for me.";
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
            openAiWs.bookingState = 'awaiting_email';
            await updateBookingStateWithRetry(openAiWs.phoneNumber, 'awaiting_email');
        }
    } catch (error) {
        console.error("Error in askForEmail:", error);
        // Fallback to asking for new email
        const prompt = "Please provide your email address so I can send you the meeting details. Please spell it out for me.";
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
        openAiWs.bookingState = 'awaiting_email';
        await updateBookingStateWithRetry(openAiWs.phoneNumber, 'awaiting_email');
    }
}

// Function to confirm user's email address
export async function confirmEmail(openAiWs, email) {
    const prompt = `Thank you! Just to confirm, your email address is spelled as: ${spellOutEmail(email)}. Is that correct? Please say "yes" or "no".`;
    openAiWs.send(JSON.stringify({
        type: "response.create",
        response: {
            modalities: ["text", "audio"],
            instructions: prompt,
            voice: VOICE,
            temperature: 0.5,
            max_output_tokens: 150,
        },
    }));
    openAiWs.bookingState = 'confirm_email';
    await updateBookingStateWithRetry(openAiWs.phoneNumber, 'confirm_email');
}