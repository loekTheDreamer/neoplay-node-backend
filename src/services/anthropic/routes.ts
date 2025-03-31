import Anthropic from '@anthropic-ai/sdk';
import { FastifyInstance } from 'fastify';
import { config } from '../../config/env';

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
    const { chatHistory, systemPrompt } = request.body as ChatRequest;
    // console.log('chatHistory:', chatHistory);
    // console.log('prompt:', systemPrompt);

    const response = await client.messages.create({
      // max_tokens: 20000, // claude-3-7-sonnet
      max_tokens: 8192, // claude-3-5-haiku
      messages: chatHistory,
      model: model
      // system: systemPrompt
    });

    console.log('response:', response);

    return response;
  });
}
