import dotenv from 'dotenv';

dotenv.config();

export const config = {
  anthropicSecretKey: process.env.ANTHROPIC_API_KEY,
  port: process.env.PORT || 4000,
  sessionSecret: process.env.SESSION_SECRET,
  xaiApiKey: process.env.XAI_API_KEY,
  cors: [
    'https://neoplay-web-tt3yh.kinsta.page',
    'http://localhost:8080',
    'http://localhost:8081',
    'http://localhost:5173',
    'https://paperclip-liart.vercel.app',
    'https://loekthedreamer.ngrok.app', // In case you use the primary one
    'https://loekthedreamer-secondary.ngrok.app' // Your current one
    // Add any other origins you need to support
  ],
  SEVALLA_ENDPOINT: process.env.SEVALLA_ENDPOINT,
  SEVALLA_ACCESS_KEY_ID: process.env.SEVALLA_ACCESS_KEY_ID,
  SEVALLA_SECRET_ACCESS_KEY: process.env.SEVALLA_SECRET_ACCESS_KEY,
  SEVALLA_BUCKET_NAME: process.env.SEVALLA_BUCKET_NAME,
  BETA_PASSWORD: process.env.BETA_PASSWORD
};

if (
  !config.anthropicSecretKey ||
  !config.xaiApiKey ||
  !config.SEVALLA_ENDPOINT ||
  !config.SEVALLA_ACCESS_KEY_ID ||
  !config.SEVALLA_SECRET_ACCESS_KEY ||
  !config.SEVALLA_BUCKET_NAME ||
  !config.BETA_PASSWORD
) {
  console.error('Missing API keys. Please set in the .env file.');
  process.exit(1);
}
