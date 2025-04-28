import OpenAI from 'openai';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config/env';
import { initialPrompt } from '../../prompts/xaiPrompts';

// Inline type for OpenAI ChatCompletionMessageParam
// (role: 'system' | 'user' | 'assistant', content: string)
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const openai = new OpenAI({
  apiKey: config.xaiApiKey,
  baseURL: 'https://api.x.ai/v1'
});

interface ChatRequest {
  chatHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  systemPrompt?: string;
}

let model = 'grok-3-beta';

// let model = 'grok-3-latest';

// let model = 'grok-3-mini-beta';

console.log('USING MODEL:', model);
let tokenCount = 0;

if (model === 'grok-3-mini-beta') {
  tokenCount = 8192;
} else {
  tokenCount = 20000;
}

export function registerXaiRoutes(fastify: FastifyInstance) {
  fastify.post('/setup-xai-stream', async (request, reply) => {
    const { chatHistory, systemPrompt } = request.body as ChatRequest;
    request.session.streamContext = { chatHistory, systemPrompt };

    // Force session to be saved and cookie to be set
    await request.session.save();

    // Log headers after setting the response
    reply.code(200).send({ success: true, message: 'Chat context ready' });

    return reply; // Ensure reply is returned
  });

  // SSE stream endpoint
  fastify.get(
    '/xai-stream',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // --- Retrieve the context from session ---
      const context = request.session.streamContext;

      if (!context) {
        console.warn(
          // Use warn level for expected-but-problematic scenarios
          `Stream context not found in session: ${request.session.sessionId}. Ensure /setup-chat-context was called and the session cookie was sent.`
        );
        // **** MODIFICATION START ****
        // Use standard Fastify reply for the error response.
        // This allows CORS headers (and other hooks) to be applied correctly.
        return reply.code(400).send({
          error:
            'Bad Request: Chat context not found in session. Please setup first.'
        });
      }

      // --- IMPORTANT: Clear context *after* retrieval ---
      // Prevents reusing old context if client reconnects or calls /stream again erroneously
      delete request.session.streamContext;
      // If using a session store that requires explicit saving after modification:
      // await request.session.save(); // Uncomment if your store needs this

      console.log(
        `Retrieved context from session ${request.session.sessionId}, context cleared from session.`
      );
      const { chatHistory } = context;

      // Prepend initialPrompt as a system message before chatHistory
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: initialPrompt },
        ...(Array.isArray(chatHistory) ? chatHistory : [])
      ];

      console.log('messages (with initialPrompt):', messages);
      console.log(
        'Headers prepared by Fastify before manual writeHead:',
        reply.getHeaders()
      );
      reply.sse(
        (async function* () {
          try {
            // Prepare messages array for OpenAI format
            // const messages: OpenAIChatMessage[] = [];

            // if (Array.isArray(chatHistory)) {
            //   for (const msg of chatHistory) {
            //     // Only allow roles 'user' or 'assistant', and enforce type
            //     if (msg.role === 'user' || msg.role === 'assistant') {
            //       messages.push({ role: msg.role, content: msg.content });
            //     }
            //   }
            // }

            const stream = await openai.chat.completions.create({
              model: model, // e.g., 'grok-3-mini-beta'
              messages: messages,
              // max_tokens: tokenCount,
              stream: true
            });

            let eventCounter = 0;
            for await (const chunk of stream) {
              eventCounter++;
              const sseId = `${request.session.sessionId}-${eventCounter}`;
              // Only send the content field, if present
              const content = chunk.choices?.[0]?.delta?.content;
              if (content) {
                yield {
                  id: sseId,
                  event: 'message',
                  data: JSON.stringify({ content })
                };
              }
            }
            // After stream ends, yield explicit done event
            yield {
              id: `${request.session.sessionId}-done`,
              event: 'done',
              data: JSON.stringify({ done: true })
            };
          } catch (error: any) {
            console.error(
              `Error during streaming for session ${request.session.sessionId}:`,
              error
            );
            yield {
              event: 'error',
              data: JSON.stringify({
                error: 'Streaming error occurred',
                details: error.message
              })
            };
          }
        })()
      );
    }
  );
}
