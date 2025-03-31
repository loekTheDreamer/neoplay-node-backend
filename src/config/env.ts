import dotenv from 'dotenv';

dotenv.config();

export const config = {
  anthropicSecretKey: process.env.ANTHROPIC_API_KEY,
  port: process.env.PORT || 4000,
  sessionSecret: process.env.SESSION_SECRET
};

if (!config.anthropicSecretKey) {
  console.error('Missing Anthropic API key. Please set in the .env file.');
  process.exit(1);
}
