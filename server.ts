import Fastify from 'fastify';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import { config } from './src/config/env.ts';
import { registerAnthropicRoutes } from './src/services/anthropic/routes.ts';

import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';

const fastify = Fastify({ logger: true });

// Register cookie plugin first
fastify.register(fastifyCookie);

// Register session plugin
fastify.register(fastifySession, {
  secret: config.sessionSecret as string,
  cookie: {
    // secure: process.env.NODE_ENV === 'production', // Send cookie only over HTTPS in production
    secure: false, // Send cookie only over HTTPS in production
    httpOnly: true, // Protects against XSS
    maxAge: 60 * 60 * 1000 // Session duration: 1 hour (example)
    // SameSite: 'lax' // Or 'strict' or 'none' (if needed for cross-site, requires secure: true)
  },
  // store: redisStore, // Uncomment to use Redis store
  saveUninitialized: false // Don't save sessions that haven't been modified
});

// Declare session property on FastifyRequest for TypeScript
declare module 'fastify' {
  interface Session {
    streamContext?: {
      // Define the shape of your session data
      chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
      systemPrompt?: string;
    };
  }
}
// Register plugins
fastify.register(fastifyCors, {
  origin: [
    'http://localhost:5173',
    'https://paperclip-liart.vercel.app',
    'https://loekthedreamer.ngrok.app'
  ], // Allow requests from your frontend
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
});
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// Register routes
registerAnthropicRoutes(fastify);

// Start the server
const start = async () => {
  try {
    await fastify.listen({ port: config.port as number });
    console.log(`New Server is running on port ${config.port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
