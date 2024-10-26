// database-utils.js

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL or Key is missing. Please check your .env file.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// User Operations
export async function dbCreateOrGetUser(phoneNumber) {
    const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('phone_number', phoneNumber)
        .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
        console.error("Error fetching user:", fetchError);
        return null;
    }

    if (existingUser) {
        return existingUser;
    }

    const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert([{ phone_number: phoneNumber }])
        .select()
        .single();

    if (insertError) {
        console.error("Error creating new user:", insertError);
        return null;
    }

    return newUser;
}

export async function dbUpdateUserName(phoneNumber, name) {
    console.log(`Updating user name for ${phoneNumber}: ${name}`);
    const { error } = await supabase
        .from('users')
        .update({ name: name })
        .eq('phone_number', phoneNumber);

    if (error) {
        console.error("Error updating user name:", error);
        return false;
    }
    return true;
}

export async function dbUpdateUserEmail(phoneNumber, email) {
    console.log(`Updating user email for ${phoneNumber}: ${email}`);
    const { error } = await supabase
        .from('users')
        .update({ email: email })
        .eq('phone_number', phoneNumber);

    if (error) {
        console.error("Error updating user email:", error);
        return false;
    }
    return true;
}

// Conversation Operations
export async function dbCreateConversation(phoneNumber, callSid) {
    // Check if a conversation already exists for this callSid
    const { data: existingConversation, error: fetchError } = await supabase
        .from('conversations')
        .select('*')
        .eq('conversation_id', callSid)
        .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // Ignore 'no rows found' error
        console.error("Error fetching conversation:", fetchError);
        return null;
    }

    if (existingConversation) {
        console.log(`Conversation already exists for conversation_id (callSid): ${callSid}`);
        return existingConversation;
    }

    // If no existing conversation, create a new one with conversation_id set to callSid
    const { data: conversation, error } = await supabase
        .from('conversations')
        .insert([{
            conversation_id: callSid, // Set conversation_id to callSid
            phone_number: phoneNumber,
            start_timestamp: new Date().toISOString()
        }])
        .select()
        .single();

    if (error) {
        console.error("Error creating conversation:", error);
        return null;
    }

    return conversation;
}

export async function dbUpdateConversation(conversationId, updates) {
    const { error } = await supabase
        .from('conversations')
        .update(updates)
        .eq('conversation_id', conversationId);

    if (error) {
        console.error("Error updating conversation:", error);
        return false;
    }
    return true;
}

export async function dbFinalizeConversation(conversationId, fullDialogue, summary) {
    const { error } = await supabase
        .from('conversations')
        .update({
            full_dialogue: fullDialogue,
            summary: summary,
            end_timestamp: new Date().toISOString()
        })
        .eq('conversation_id', conversationId);

    if (error) {
        console.error("Error finalizing conversation:", error);
        return false;
    }
    return true;
}

export async function dbGetLastConversation(phoneNumber) {
    const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('phone_number', phoneNumber)
        .order('start_timestamp', { ascending: false })
        .limit(1)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error("Error fetching last conversation:", error);
        return null;
    }

    return data;
}

// Booking Operations
export async function dbCreateBooking(phoneNumber, conversationId, eventId, time, email) {
    const { data: booking, error } = await supabase
        .from('bookings')
        .insert([{
            booking_id: eventId,
            phone_number: phoneNumber,
            conversation_id: conversationId,
            booking_state: 'confirmed',
            booking_time: time,
            booking_email: email
        }])
        .select()
        .single();

    if (error) {
        console.error("Error creating booking:", error);
        return null;
    }

    return booking;
}

export async function dbUpdateBookingState(bookingId, state) {
    const { error } = await supabase
        .from('bookings')
        .update({ booking_state: state })
        .eq('booking_id', bookingId);

    if (error) {
        console.error("Error updating booking state:", error);
        return false;
    }
    return true;
}

// Utility function for email extraction
export async function extractEmailFromSummary(summary) {
    const prompt = `Extract email address from the following conversation summary. If no email is mentioned, respond with "Email not found".

Summary:
${summary}

Extracted Email:`;

    try {
        const response = await fetch(process.env.AZURE_OPENAI_CHAT_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": process.env.AZURE_OPENAI_CHAT_API_KEY,
            },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: "You are a helpful assistant that extracts specific information from text." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 50,
                temperature: 0,
            }),
        });

        if (!response.ok) {
            console.error("Error extracting email:", response.statusText);
            return null;
        }

        const data = await response.json();
        const extractedEmail = data.choices[0].message.content.trim();

        if (extractedEmail.toLowerCase() === "email not found") {
            return null;
        }

        // Validate the extracted email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(extractedEmail) ? extractedEmail : null;

    } catch (error) {
        console.error("Error in extractEmailFromSummary:", error);
        return null;
    }
}
