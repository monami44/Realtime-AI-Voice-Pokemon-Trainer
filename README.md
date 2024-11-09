# AI Assistant System Documentation

A sophisticated AI assistant system featuring booking management, investment handling, long-term memory, and intelligent conversation capabilities.

## Table of Contents
- [Overview](#overview)
- [Features](#features)
- [System Architecture](#system-architecture)
- [Core Components](#core-components)
  - [Booking System](#booking-system)
  - [Investment Handling](#investment-handling)
  - [Long-Term Memory System](#long-term-memory-system)
  - [Database Operations](#database-operations)
- [Knowledge Base](#knowledge-base)
- [Data Collection Logic](#data-collection-logic)
- [Setup and Installation](#setup-and-installation)
- [Environment Variables](#environment-variables)
- [API Documentation](#api-documentation)
- [Development](#development)
- [Deployment](#deployment)
- [Monitoring and Logging](#monitoring-and-logging)
- [Security Considerations](#security-considerations)
- [Contributing](#contributing)
- [License](#license)
- [Support](#support)
- [Acknowledgments](#acknowledgments)

## Overview

The AI Assistant System is a comprehensive solution that provides:
- **Automated booking management** with Google Calendar integration.
- **Investment inquiry handling** with expert redirection.
- **Long-term memory** for personalized user interactions.
- **Robust database operations** for data persistence.

## Features

- **Intelligent Conversation**
  - Natural language processing.
  - Context-aware responses.
  - Multi-modal interaction (text/voice).

- **Booking Management**
  - Automated scheduling.
  - Email confirmation.
  - Google Calendar integration.
  - State management.

- **Investment Handling**
  - Expert redirection.
  - Call management.
  - State tracking.

- **Long-Term Memory**
  - Vector embeddings.
  - Semantic search.
  - Persistent user information.

## System Architecture

### Core Components Interaction

```mermaid
flowchart TD
    A[User Interface] -->|Input| B[OpenAI Handler]
    B -->|Process| C{Router}
    C -->|Booking| D[Booking System]
    C -->|Investment| E[Investment Handler]
    C -->|Memory| F[Long-Term Memory]
    D -->|Store| G[(Database)]
    E -->|Update| G
    F -->|Persist| G
```

**Explanation:**
- **User Interface:** The entry point where users interact with the system via text or voice.
- **OpenAI Handler:** Handles the processing of user inputs using OpenAI's APIs.
- **Router:** Directs the flow to appropriate components based on user intent (Booking, Investment, Memory).
- **Booking System:** Manages scheduling and booking operations.
- **Investment Handler:** Manages investment-related inquiries and redirects.
- **Long-Term Memory:** Handles persistent storage and retrieval of user information.
- **Database:** Central storage system where all data is persisted.

### Database Schema

```mermaid
erDiagram
    users ||--o{ conversations : has
    users ||--o{ bookings : makes
    conversations ||--o{ bookings : contains

    users {
        string phone_number PK
        string name
        string email
        timestamp created_at
    }

    conversations {
        string conversation_id PK
        string phone_number FK
        text full_dialogue
        text summary
        timestamp end_timestamp
    }

    bookings {
        string booking_id PK
        string phone_number FK
        string conversation_id FK
        timestamp booking_time
        string booking_state
    }
```

## Core Components

### Booking System

The booking system manages training session scheduling through Google Calendar integration.

```mermaid
flowchart TD
    A[User] -->|Request booking| B[System]
    B -->|Ask for preferred time| C[User]
    C -->|Provide time| B
    B -->|Check email history| D[Database]
    
    subgraph Email Handling
        direction TB
        D -->|Has stored email| E[System]
        E -->|Confirm stored email| F[User]
        F -->|Confirm email| G[System]
        G -->|Create calendar event| H[Google Calendar]
        H -->|Store booking| D
        D -->|Booking confirmed| I[User]
        
        D -->|No stored email| J[System]
        J -->|Request email| K[User]
        K -->|Provide email| J
        J -->|Validate email| L[System]
        
        subgraph Email Confirmation
            direction TB
            L -->|Valid email| M[User]
            M -->|Confirm spelling| N[System]
            N -->|Create calendar event| H
            H -->|Store booking| D
            D -->|Booking confirmed| I
            
            L -->|Invalid email| O[User]
            O -->|Request again| J
        end
    end
```

#### Implementation Details

```javascript
export async function askForSuitableTime(openAiWs) {
    const prompt = "Sure! I'd be happy to book a training session for you. What time would suit you best?";
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
```

### Investment Handling

The investment handling system manages investor inquiries and expert redirection.

```javascript
export async function redirectToFundraisingExpert(callSid) {
    if (!callSid) {
        throw new Error('Call SID is required for redirection');
    }

    try {
        const twiml = new VoiceResponse();
        twiml.say({
            voice: 'alice'
        }, "Connecting you to our fundraising expert now.");
        
        twiml.dial({
            action: '/call-status',
            method: 'POST',
            timeout: 30,
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
            statusCallback: '/call-status',
            statusCallbackMethod: 'POST'
        }, process.env.EXPERT_PHONE_NUMBER);

        await twilioClient.calls(callSid).update({
            twiml: twiml.toString()
        });
    } catch (error) {
        console.error("Failed to redirect to fundraising expert:", error);
        throw error;
    }
}
```

### Long-Term Memory System

```javascript
export async function getRelevantLongTermMemory(phoneNumber, query) {
    try {
        const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                input: query,
                model: "text-embedding-ada-002",
            }),
        });

        const embeddingData = await embeddingResponse.json();
        const queryEmbedding = embeddingData.data[0].embedding;

        const { data } = await supabase.rpc(
            'search_long_term_memory',
            {
                query_embedding: queryEmbedding,
                user_phone: phoneNumber,
                match_threshold: 0.5,
                match_count: 3
            }
        );

        return data.map(item => item.context);
    } catch (error) {
        console.error('Error in getRelevantLongTermMemory:', error);
        return [];
    }
}
```

## Setup and Installation

### Prerequisites
- **Node.js** (v16 or higher)
- **PostgreSQL** with Vector extension
- **Supabase** account
- **OpenAI** API access
- **Azure OpenAI** API access
- **Twilio** account
- **Google Calendar** API credentials

### Installation Steps

1. **Clone the repository**
    ```bash
    git clone <repository-url>
    cd ai-assistant-system
    ```

2. **Install dependencies**
    ```bash
    npm install
    ```

3. **Set up environment variables**
    ```bash
    cp .env.example .env
    ```

4. **Initialize the database**
    ```bash
    npm run db:init
    ```

## Environment Variables

Create a `.env` file with the following variables:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
AZURE_OPENAI_CHAT_API_KEY=your_azure_api_key
AZURE_OPENAI_CHAT_ENDPOINT=your_azure_endpoint

# Database Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# Twilio Configuration
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_number

# Google Calendar Configuration
GOOGLE_CALENDAR_ID=your_calendar_id
GOOGLE_CLIENT_EMAIL=your_client_email
GOOGLE_PRIVATE_KEY=your_private_key

# Application Configuration
EXPERT_PHONE_NUMBER=your_expert_number
VOICE=your_preferred_voice
```

## API Documentation

### Conversation Endpoints

#### Start Conversation

```http
POST /api/conversation/start
Content-Type: application/json

{
    "phone_number": "string",
    "initial_message": "string"
}
```

#### End Conversation

```http
POST /api/conversation/end
Content-Type: application/json

{
    "conversation_id": "string"
}
```

### Booking Endpoints

```http
POST /api/booking/create
Content-Type: application/json

{
    "phone_number": "string",
    "preferred_time": "string",
    "email": "string"
}
```

## Development

### Local Development

1. **Start the development server**
    ```bash
    npm run dev
    ```

2. **Run tests**
    ```bash
    npm test
    ```

3. **Lint code**
    ```bash
    npm run lint
    ```

## Deployment

### Production Deployment

1. **Build the application**
    ```bash
    npm run build
    ```

2. **Start the production server**
    ```bash
    npm start
    ```

### Docker Deployment

1. **Build the Docker image**
    ```bash
    docker build -t ai-assistant .
    ```

2. **Run the container**
    ```bash
    docker run -p 3000:3000 ai-assistant
    ```

## Monitoring and Logging

- **Application Logs:** Managed via Winston for structured logging.
- **Error Tracking:** Integrated with Sentry for real-time error monitoring.
- **Performance Monitoring:** Utilizes New Relic to monitor application performance.

### Log Levels

```javascript
{
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
}
```

## Security Considerations

- **Authenticated Endpoints:** All API endpoints require proper authentication.
- **Rate Limiting:** Implemented to prevent abuse and ensure fair usage.
- **Input Validation:** Ensures all inputs are sanitized and validated.
- **Secure Storage:** Sensitive information is stored securely with encryption.
- **Regular Audits:** Conducted to identify and mitigate security risks.

## Contributing

1. **Fork the repository**
2. **Create a feature branch**
3. **Commit changes**
4. **Push to the branch**
5. **Create a Pull Request**

**Guidelines:**
- Follow the coding standards
- Write clear commit messages
- Ensure all tests pass
- Provide documentation for new features

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## Support

For support, email [support@example.com](mailto:support@example.com) or join our Slack channel.

## Acknowledgments

- **OpenAI:** For their API and AI services
- **Twilio:** For voice capabilities
- **Supabase:** For database solutions
- **Azure:** For additional AI capabilities
- **Google:** For Google Calendar API integration