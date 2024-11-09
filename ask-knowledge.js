import { supabase } from './supabase-client.js';

/**
 * Queries the knowledge base using OpenAI embeddings and Supabase vector search
 * @param {string} question - The user's question to query against the knowledge base
 * @returns {Promise<string|null>} Combined answer from relevant documents or null if no matches
 */
export async function askSupabaseAssistant(question) {
    console.log("Querying knowledge base for:", question);
    try {
        // Generate embedding for the question using OpenAI's Embedding API
        const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                input: question,
                model: "text-embedding-ada-002",
            }),
        });

        if (!embeddingResponse.ok) {
            console.error("Error fetching embedding from OpenAI:", embeddingResponse.statusText);
            return null;
        }

        const embeddingData = await embeddingResponse.json();
        const queryEmbedding = embeddingData.data[0].embedding;

        const { data, error } = await supabase.rpc('search_documents', { 
            query_embedding: queryEmbedding 
        });

        if (error) {
            console.error("Error querying Supabase:", error.message);
            return null;
        }

        if (data && data.length > 0) {
            console.log("Knowledge base answers found:", data);
            // Combine context and relevant metadata for a more informative answer
            const combinedAnswer = data.map(item => {
                const metadataStr = Object.entries(item.metadata)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(', ');
                return `${item.context} (${metadataStr})`;
            }).join('\n');
            return combinedAnswer;
        } else {
            console.log("No relevant documents found in Supabase.");
            return null;
        }
    } catch (error) {
        console.error("Error in askSupabaseAssistant:", error);
        return null;
    }
} 