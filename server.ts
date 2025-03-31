import Fastify from 'fastify';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import { config } from './src/config/env.ts';
import { registerAnthropicRoutes } from './src/services/anthropic/routes.ts';

const fastify = Fastify();

// Register plugins
fastify.register(fastifyCors, {
  origin: 'http://localhost:5173', // Allow requests from your frontend
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
