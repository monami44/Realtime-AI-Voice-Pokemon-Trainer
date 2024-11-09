-- Enable the pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the function to retrieve the top 5 most similar documents
CREATE OR REPLACE FUNCTION get_similar_documents(query_embedding VECTOR)
RETURNS TABLE (
    id INT,
    context TEXT,
    metadata JSONB,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        documents.id, 
        documents.context, 
        documents.metadata,
        1 - (documents.embedding <=> query_embedding) AS similarity
    FROM documents
    WHERE 1 - (documents.embedding <=> query_embedding) > 0.7
    ORDER BY similarity DESC
    LIMIT 5;
END;
$$ LANGUAGE plpgsql;
