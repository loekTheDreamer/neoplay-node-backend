import dotenv from 'dotenv';

dotenv.config();

export const config = {
  anthropicSecretKey: process.env.ANTHROPIC_API_KEY,
  port: process.env.PORT || 4000,
  sessionSecret: process.env.SESSION_SECRET,
  cors: [
    'http://localhost:5173',
    'https://paperclip-liart.vercel.app',
    'https://loekthedreamer.ngrok.app', // In case you use the primary one
    'https://loekthedreamer-secondary.ngrok.app' // Your current one
    // Add any other origins you need to support
  ]
};

if (!config.anthropicSecretKey) {
  console.error('Missing Anthropic API key. Please set in the .env file.');
  process.exit(1);
}
