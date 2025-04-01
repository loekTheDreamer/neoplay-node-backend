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
  secret: config.sessionSecret as string, // Ensure this is a strong, private secret
  cookie: {
    secure: true, // REQUIRED for SameSite=None and HTTPS (ngrok provides HTTPS)
    httpOnly: true, // Good practice: Cookie cannot be accessed by client-side scripts
    maxAge: 60 * 60 * 1000, // 1 hour
    sameSite: 'none' // <-- THE KEY FIX: Allow cross-origin cookie sending
    // path: '/' // Usually defaults to '/' but can be explicit if needed
  },
  saveUninitialized: false
});

// Declare session property on FastifyRequest for TypeScript
declare module 'fastify' {
  interface Session {
    streamContext?: {
      chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
      systemPrompt?: string;
    };
    // Add other session properties if needed
  }
}

// Register plugins
fastify.register(fastifyCors, {
  // Ensure your ngrok URL and any Vercel URLs are listed
  origin: [
    'http://localhost:5173',
    'https://paperclip-liart.vercel.app',
    'https://loekthedreamer.ngrok.app', // In case you use the primary one
    'https://loekthedreamer-secondary.ngrok.app' // Your current one
    // Add any other origins you need to support
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true // REQUIRED to allow cookies/auth headers cross-origin
});
fastify.register(fastifyFormBody);
fastify.register(fastifyWs); // Assuming you might need WebSockets elsewhere

// Register routes
registerAnthropicRoutes(fastify); // Pass the fastify instance

// Start the server
const start = async () => {
  try {
    // Listen on all available network interfaces if running in containers or VMs,
    // or stick to localhost if only accessing locally before ngrok.
    // '0.0.0.0' is often needed for Docker/cloud, localhost is fine for local dev + ngrok.
    await fastify.listen({ port: config.port as number, host: '0.0.0.0' }); // Or '127.0.0.1' / 'localhost'
    console.log(`Server listening on port ${config.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
