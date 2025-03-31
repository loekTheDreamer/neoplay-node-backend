import Anthropic from '@anthropic-ai/sdk';
import { FastifyInstance } from 'fastify';
import { config } from '../../config/env';
import { v4 as uuidv4 } from 'uuid';

const client = new Anthropic({
  apiKey: config.anthropicSecretKey
});

interface ChatRequest {
  chatHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  systemPrompt?: string;
}

// const model = 'claude-3-7-sonnet-20250219';
// const model2 = "claude-3-5-sonnet-20241022"
const model = 'claude-3-5-haiku-20241022';

export function registerAnthropicRoutes(fastify: FastifyInstance) {
  // Root Route
  fastify.get('/', async (request, reply) => {
    reply.send({ message: 'Anthropic Media Stream Server is running!' });
  });

  fastify.post('/chat', async (request, reply) => {
    console.log('/chat...');

    const { chatHistory, systemPrompt } = request.body as ChatRequest;
    // console.log('chatHistory:', chatHistory);
    // console.log('prompt:', systemPrompt);

    const response = await client.messages.create({
      max_tokens: 20000, // claude-3-7-sonnet
      // max_tokens: 8192, // claude-3-5-haiku
      messages: chatHistory,
      model: model,
      system: systemPrompt
    });

    // console.log('response:', response);

    return response;
  });

  // fastify.post('/stream', async (request, reply) => {
  //   console.log('/stream...');

  //   const { chatHistory, systemPrompt } = request.body as ChatRequest;
  //   // console.log('chatHistory:', chatHistory);
  //   // console.log('prompt:', systemPrompt);
  //   try {
  //     const stream = await client.messages.create({
  //       // max_tokens: 20000, // claude-3-7-sonnet
  //       max_tokens: 8192, // claude-3-5-haiku
  //       messages: chatHistory,
  //       model: model,
  //       // system: systemPrompt,
  //       stream: true
  //     });

  //     for await (const messageStreamEvent of stream) {
  //       if (messageStreamEvent.type === 'content_block_delta') {
  //         console.log('text:', messageStreamEvent.delta);
  //         reply.raw.write(messageStreamEvent.delta);
  //       }
  //     }
  //   } catch (error) {
  //     console.log('error:', error);
  //   }
  // });

  // 1. Initialization endpoint that stores the chat data and returns a session ID
  fastify.post('/init-stream', async (request, reply) => {
    const sessionId = uuidv4(); // implement this
    const { chatHistory, systemPrompt } = request.body as ChatRequest;

    // Store the chat data for this session
    sessions.set(sessionId, { chatHistory, systemPrompt });

    return { sessionId };
  });

  fastify.get('/stream', async (request, reply) => {
    const { sessionId } = request.query;
    const sessionData = sessions.get(sessionId);

    if (!sessionData) {
      reply.code(404).send({ error: 'Session not found' });
      return;
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });

    try {
      const stream = await client.messages.create({
        max_tokens: 8192,
        messages: sessionData.chatHistory,
        model: model,
        stream: true
      });

      for await (const messageStreamEvent of stream) {
        if (messageStreamEvent.type === 'content_block_delta') {
          reply.raw.write(
            `data: ${JSON.stringify(messageStreamEvent.delta)}\n\n`
          );
        }
      }

      reply.raw.write('data: [DONE]\n\n');
      sessions.delete(sessionId); // Clean up the session
    } catch (error) {
      console.error('Stream error:', error);
      reply.raw.write(
        `data: ${JSON.stringify({ error: 'An error occurred' })}\n\n`
      );
    }
  });
}
