import { supabase } from '../config/supabase-client.js';
import { 
    updateUserNameWithRetry,
    updateUserEmailWithRetry,
    finalizeConversationInDbWithRetry,
    getUserEmailWithRetry
} from './retry.js';
import { 
    extractEmailFromSummary 
} from '../database/database-utils.js';
import { 
    storeLongTermMemory,
    extractRelevantInfo 
} from '../database/long-term-memory.js';

// Function to update user name if not already set
export async function updateUserName(phoneNumber, name) {
    console.log(`Attempting to update user name for ${phoneNumber}: ${name}`);
    const { data, error } = await supabase
        .from('users')
        .select('name')
        .eq('phone_number', phoneNumber)
        .single();

    if (error && error.code !== 'PGRST116') { // Ignore 'no rows found' error
        console.error("Error checking existing user name:", error);
        return;
    }

    if (data && data.name) {
        console.log(`User name already exists for ${phoneNumber}. Not updating.`);
        return;
    }

    const { data: updateData, error: updateError } = await supabase
        .from('users')
        .update({ name: name })
        .eq('phone_number', phoneNumber);

    if (updateError) {
        console.error("Error updating user name:", updateError);
    } else {
        console.log("User name updated successfully");
    }
}



// Function to finalize the conversation and generate summary
export async function finalizeConversation(openAiWs) {
    if (!openAiWs.conversationId) {
        console.log("No conversation ID, skipping finalization");
        return;
    }

    console.log("Finalizing conversation:", openAiWs.conversationId);

    try {
        // Generate summary using Azure OpenAI
        const summaryResponse = await fetch(process.env.AZURE_OPENAI_CHAT_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": process.env.AZURE_OPENAI_CHAT_API_KEY,
            },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: "You are a helpful assistant that summarizes conversations without including greetings." },
                    { role: "user", content: `Please summarize the following conversation:\n${openAiWs.fullDialogue}. Please do not include the greetings in summary, only the main conversation topic.` }
                ],
                max_tokens: 150
            }),
        });

        if (!summaryResponse.ok) {
            throw new Error("Error generating summary: " + summaryResponse.statusText);
        }

        const summaryData = await summaryResponse.json();
        const summary = summaryData.choices[0].message.content.trim();

        // Extract user's name from the summary
        const extractedName = await extractUserNameFromSummary(summary);
        if (extractedName) {
            await updateUserNameWithRetry(openAiWs.phoneNumber, extractedName);
        }

        // Extract email from the summary
        const extractedEmail = await extractEmailFromSummary(summary);
        if (extractedEmail) {
            await updateUserEmailWithRetry(openAiWs.phoneNumber, extractedEmail);
        }

        // Extract relevant information for long-term memory
        const relevantInfo = await extractRelevantInfo(openAiWs.fullDialogue);
        
        // Store relevant information in long-term memory
        for (const [key, value] of Object.entries(relevantInfo)) {
            if (value) {
                await storeLongTermMemory(
                    openAiWs.phoneNumber, 
                    openAiWs.conversationId,
                    `${key}: ${value}`
                );
            }
        }

        // Finalize the conversation in the database
        await finalizeConversationInDbWithRetry(
            openAiWs.conversationId,
            openAiWs.fullDialogue,
            summary
        );

    } catch (error) {
        console.error("Error finalizing conversation:", error);
    }
}

/**
 * Function to extract user's name from the conversation summary
 * @param {string} summary - The conversation summary.
 * @returns {string|null} - Extracted name or null if not found.
 */
export async function extractUserNameFromSummary(summary) {
    const prompt = `Extract the user's name from the following conversation summary. If the name is not mentioned, respond with "Name not found".

Summary:
${summary}

Extracted Name:`;

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
                max_tokens: 10,
                temperature: 0,
            }),
        });

        if (!response.ok) {
            console.error("Error extracting user name:", response.statusText);
            return null;
        }

        const data = await response.json();
        const extractedName = data.choices[0].message.content.trim();

        // Handle case where name is not found
        if (extractedName.toLowerCase() === "name not found") {
            return null;
        }

        console.log("Extracted user name:", extractedName);
        return extractedName;
    } catch (error) {
        console.error("Error in extractUserNameFromSummary:", error);
        return null;
    }
}

// Function to update booking state in Supabase
export async function updateBookingState(phoneNumber, state) {
    console.log(`Updating booking state for ${phoneNumber} to ${state}`);
    const { data, error } = await supabase
        .from('user_conversations')
        .update({ booking_state: state })
        .eq('phone_number', phoneNumber);

    if (error) {
        console.error("Error updating booking state:", error);
    } else {
        console.log(`Booking state updated to ${state} for ${phoneNumber}`);
    }
}



// New Function: Retrieve User Email
export async function retrieveUserEmail(phoneNumber) {
    console.log("Retrieving user email for phone number:", phoneNumber);
    try {
        const email = await getUserEmailWithRetry(phoneNumber);
        if (email) {
            console.log("Email retrieved:", email);
            return email;
        } else {
            console.log("No email found for user.");
            return null;
        }
    } catch (error) {
        console.error("Error retrieving user email:", error);
        return null;
    }
}