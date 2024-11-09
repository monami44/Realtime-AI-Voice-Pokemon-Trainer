-- Enable the pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the function to retrieve similar embeddings from long_term_memory
CREATE OR REPLACE FUNCTION get_user_similar_memory(
    user_phone TEXT,
    query_embedding VECTOR,
    match_threshold FLOAT,
    match_count INT
)
RETURNS TABLE (
    context TEXT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ltm.context,
        1 - (ltm.embedding <=> query_embedding) AS similarity
    FROM long_term_memory ltm
    WHERE ltm.user_phone_number = user_phone
      AND 1 - (ltm.embedding <=> query_embedding) > match_threshold
    ORDER BY ltm.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
