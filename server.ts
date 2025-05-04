import Fastify from 'fastify';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';

import { config } from './src/config/env.ts';
import { registerAnthropicRoutes } from './src/services/anthropic/routes.ts';

import { FastifySSEPlugin } from 'fastify-sse-v2';
import { registerGameRoutes } from './src/services/game/route.ts';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { registerXaiRoutes } from './src/services/xai/routes.ts';
import { registerDbRoutes } from './src/services/db/route.ts';
import { registerPublishRoutes } from './src/services/publish/routes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// const fastify = Fastify({ logger: true });
const fastify = Fastify({ logger: { level: 'warn' } });

// Register cookie plugin first
fastify.register(fastifyCookie);

// Register session plugin
fastify.register(fastifySession, {
  secret: config.sessionSecret as string, // Ensure this is a strong, private secret
  cookie: {
    // ngrok
    secure: true,
    httpOnly: true, // Good practice: Cookie cannot be accessed by client-side scripts
    maxAge: 60 * 60 * 1000, // 1 hour
    sameSite: 'none'

    // local
    // secure: false,
    // httpOnly: true, // Good practice: Cookie cannot be accessed by client-side scripts
    // maxAge: 60 * 60 * 1000 // 1 hour
  },
  saveUninitialized: false
});
fastify.register(FastifySSEPlugin);

// Declare session property on FastifyRequest for TypeScript
declare module 'fastify' {
  interface Session {
    streamContext?: {
      chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
      systemPrompt?: string;
      threadId: string;
    };
    // Add other session properties if needed
  }
}

// Register plugins
fastify.register(fastifyCors, {
  // Ensure your ngrok URL and any Vercel URLs are listed
  origin: config.cors,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true, // REQUIRED to allow cookies/auth headers cross-origin
  preflight: true // Explicitly enable preflight handling
});

fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/', // or '/public/' if you want URLs to start with /public/
  list: true // <--- This enables directory listing!
});
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// Register routes
registerDbRoutes(fastify);
// registerAnthropicRoutes(fastify);
registerGameRoutes(fastify);
registerXaiRoutes(fastify);
registerPublishRoutes(fastify);

if (process.env.NODE_ENV === 'production') {
  console.log = function () {};
  console.debug = function () {};
  console.info = function () {};
  // Keep console.error and console.warn active for critical issues
}
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
