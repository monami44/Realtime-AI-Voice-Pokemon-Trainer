import dotenv from "dotenv";
import path from 'path';
import { fileURLToPath } from 'url';
import twilio from 'twilio';

// Set up __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Check for required environment variables
if (!process.env.TWILIO_ACCOUNT_SID) {
    throw new Error('TWILIO_ACCOUNT_SID environment variable is required');
}

if (!process.env.TWILIO_AUTH_TOKEN) {
    throw new Error('TWILIO_AUTH_TOKEN environment variable is required');
}

// Initialize and export Twilio client
export const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

// Export VoiceResponse for TwiML generation
export const VoiceResponse = twilio.twiml.VoiceResponse; 