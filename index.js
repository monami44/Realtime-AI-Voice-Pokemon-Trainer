// index.js

import dotenv from "dotenv";
import path from 'path';
import { fileURLToPath } from 'url';
import { PORT } from './constants.js';
import { setupServer } from './server-setup.js';

// Set up environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Initialize and start server
const server = setupServer();

server.listen({ port: PORT }, (err, address) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`AI Assistant With a Brain Server is listening on ${address}`);
});
