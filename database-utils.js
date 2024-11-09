// database-utils.js

import { supabase } from './supabase-client.js';

// User Operations
export async function dbCreateOrGetUser(phoneNumber) {
    const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('phone_number, name, email, created_at')
        .eq('phone_number', phoneNumber)
        .single();

    if (fetchError) {
        if (fetchError.code !== 'PGRST116') {  // Not a "no rows found" error
            console.error("Error fetching user:", fetchError);
            return null;
        }
        
        // Create new user if not found
        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert([{ 
                phone_number: phoneNumber,
                created_at: new Date().toISOString()
            }])
            .select('phone_number, name, email, created_at')
            .single();

        if (insertError) {
            console.error("Error creating new user:", insertError);
            return null;
        }

        return newUser;
    }

    return existingUser;
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

export async function dbGetUserEmail(phoneNumber) { // New function for email retrieval
    console.log(`Fetching email for phone number: ${phoneNumber}`);
    const { data, error } = await supabase
        .from('users')
        .select('email')
        .eq('phone_number', phoneNumber)
        .single();

    if (error) {
        if (error.code === 'PGRST116') { // No user found
            console.log(`No user found with phone number: ${phoneNumber}`);
            return null;
        }
        console.error("Error fetching user email:", error);
        return null;
    }

    return data.email;
}

// Conversation Operations
export async function dbCreateConversation(phoneNumber, callSid) {
    const { data: conversation, error } = await supabase
        .from('conversations')
        .upsert({
            conversation_id: callSid,
            phone_number: phoneNumber,
            start_timestamp: new Date().toISOString()
        }, {
            onConflict: 'conversation_id',
            ignoreDuplicates: false
        })
        .select()
        .single();

    if (error) {
        console.error("Error creating/updating conversation:", error);
        return null;
    }

    console.log(`Conversation created/updated for conversation_id (callSid): ${callSid}`);
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
    console.log(`Finalizing conversation: ${conversationId}`);
    console.log(`Full dialogue length: ${fullDialogue.length}`);
    console.log(`Summary length: ${summary.length}`);

    const { data, error } = await supabase
        .from('conversations')
        .update({
            full_dialogue: fullDialogue,
            summary: summary,
            end_timestamp: new Date().toISOString()
        })
        .eq('conversation_id', conversationId)
        .select();

    if (error) {
        console.error("Error finalizing conversation:", error);
        return false;
    }

    if (data && data.length > 0) {
        console.log(`Successfully finalized conversation: ${conversationId}`);
        return true;
    } else {
        console.error(`No conversation updated for ID: ${conversationId}`);
        return false;
    }
}

export async function dbGetLastConversation(phoneNumber) {
    console.log("Fetching last conversation for phone number:", phoneNumber);
    
    const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('phone_number', phoneNumber)
        .not('conversation_id', 'is', null)
        .not('summary', 'eq', '')
        .not('full_dialogue', 'eq', '')
        .not('end_timestamp', 'is', null)
        .order('end_timestamp', { ascending: false })
        .limit(1)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            console.log("No previous conversation found for:", phoneNumber);
            return null;
        }
        console.error("Error fetching last conversation:", error);
        throw error; // Throw the error instead of returning null
    }

    console.log("Retrieved last conversation for:", phoneNumber, "Data:", data);
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

export async function dbCheckConversationExists(conversationId) {
    const { data, error } = await supabase
        .from('conversations')
        .select('conversation_id')
        .eq('conversation_id', conversationId)
        .single();

    if (error) {
        if (error.code === 'PGRST116') { // No data found
            return false;
        }
        console.error("Error checking conversation existence:", error);
        return null;
    }

    return true;
}
