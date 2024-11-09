import { generateEmbedding } from '../utils/utils.js';
import { supabase } from '../config/supabase-client.js';
import fetch from 'node-fetch';
import dotenv from "dotenv";
import path from 'path';
import { fileURLToPath } from 'url';

// Set up environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Retrieves relevant memories based on query and phone number
 */
export async function getRelevantLongTermMemory(phoneNumber, query) {
    try {
        // Generate embedding for the query
        const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                input: query,
                model: "text-embedding-ada-002",
            }),
        });

        if (!embeddingResponse.ok) {
            console.error("Error fetching embedding from OpenAI:", embeddingResponse.statusText);
            return [];
        }

        const embeddingData = await embeddingResponse.json();
        const queryEmbedding = embeddingData.data[0].embedding;

        // Search memories using embedding similarity
        const { data, error } = await supabase.rpc(
            'search_long_term_memory',
            {
                query_embedding: queryEmbedding,
                user_phone: phoneNumber,
                match_threshold: 0.5,
                match_count: 3
            }
        );

        if (error) {
            console.error('Error retrieving long-term memory:', error);
            return [];
        }

        return data.map(item => item.context);

    } catch (error) {
        console.error('Error in getRelevantLongTermMemory:', error);
        return [];
    }
}

/**
 * Stores a new memory in the long-term memory database
 */
export async function storeLongTermMemory(phoneNumber, conversationId, context) {
    try {
        const embedding = await generateEmbedding(context);
        if (!embedding) {
            console.error("Failed to generate embedding for memory");
            return false;
        }

        const { error } = await supabase
            .from('long_term_memory')
            .insert({
                user_phone_number: phoneNumber,
                conversation_id: conversationId,
                context: context,
                embedding: embedding,
                created_at: new Date().toISOString()
            });

        if (error) {
            console.error('Error storing long-term memory:', error);
            return false;
        }

        console.log(`Successfully stored memory for ${phoneNumber}: ${context}`);
        return true;
    } catch (error) {
        console.error('Error in storeLongTermMemory:', error);
        return false;
    }
}

/**
 * Extracts relevant information from the conversation summary
 */
export async function extractRelevantInfo(dialogue) {
    const allowedFields = ['birthday', 'favorite_pokemon', 'allergies', 'parents_names', 'address'];
    
    try {
        const response = await fetch(process.env.AZURE_OPENAI_CHAT_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": process.env.AZURE_OPENAI_CHAT_API_KEY,
            },
            body: JSON.stringify({
                messages: [
                    { 
                        role: "system", 
                        content: "Extract key information mentioned in the conversation. Only include the following fields if explicitly mentioned: birthday, favorite_pokemon, allergies, parents_names, address. Respond with a clean JSON object. Format values as plain strings without special formatting." 
                    },
                    { 
                        role: "user", 
                        content: dialogue 
                    }
                ],
                temperature: 0.3,
                max_tokens: 300,
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;

        const cleanedContent = content
            .replace(/```json\s*/, '')
            .replace(/```\s*$/, '')
            .trim();

        const parsed = JSON.parse(cleanedContent);
        const result = {};

        for (const field of allowedFields) {
            if (parsed[field] && typeof parsed[field] === 'string' && parsed[field].trim()) {
                result[field] = parsed[field].trim();
            }
        }

        console.log("Extracted information:", result);
        return result;

    } catch (error) {
        console.error("Error in extractRelevantInfo:", error);
        return {};
    }
} 