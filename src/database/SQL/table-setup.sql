-- Create the users table
CREATE TABLE users (
    phone_number TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    created_at TIMESTAMPTZ
);

-- Create the long_term_memory table
CREATE TABLE long_term_memory (
    id SERIAL PRIMARY KEY,
    user_phone_number TEXT REFERENCES users(phone_number),
    conversation_id TEXT REFERENCES conversations(conversation_id),
    context TEXT,
    embedding VECTOR,
    created_at TIMESTAMPTZ
);

-- Create the bookings table
CREATE TABLE bookings (
    booking_id TEXT PRIMARY KEY,
    phone_number TEXT REFERENCES users(phone_number),
    conversation_id TEXT REFERENCES conversations(conversation_id),
    booking_state TEXT,
    booking_time TIMESTAMPTZ,
    booking_email TEXT,
    created_at TIMESTAMPTZ
);

-- Create the conversations table
CREATE TABLE conversations (
    conversation_id TEXT PRIMARY KEY,
    phone_number TEXT REFERENCES users(phone_number),
    full_dialogue TEXT,
    summary TEXT,
    start_timestamp TIMESTAMPTZ,
    end_timestamp TIMESTAMPTZ,
    last_question TEXT,
    last_answer TEXT
);

-- Create the documents table
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    context TEXT,
    embedding VECTOR,
    metadata JSONB
);
