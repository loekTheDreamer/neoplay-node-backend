import OpenAI from 'openai';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config/env.js';
import { initialPrompt } from '../../prompts/xaiPrompts.js';

// Inline type for OpenAI ChatCompletionMessageParam
// (role: 'system' | 'user' | 'assistant', content: string)
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { authMiddleware } from '../../middleware/auth.js';
import { addThreadMessage } from '../game/gameHelpers.js';
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
  threadId: string;
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
  fastify.post(
    '/setup-xai-stream',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = (request as any).user;
      console.log('user:', user);
      console.log('User-Agent:', request.headers['user-agent']);
      console.log('Cookies:', request.cookies);
      if (!user || !user.id) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      const { chatHistory, systemPrompt, threadId } =
        request.body as ChatRequest;
      request.session.streamContext = { chatHistory, systemPrompt, threadId };

      // Force session to be saved and cookie to be set
      await request.session.save();

      console.log(
        `Session ID after save for setup: ${request.session.sessionId}`
      );
      console.log('Session cookie set:', request.session.cookie);

      return reply.code(200).send({
        success: true,
        sessionId: request.session.sessionId
      });
    }
  );

  // SSE stream endpoint
  fastify.get(
    '/xai-stream',
    // { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      console.log('Streaming request received');
      console.log('User-Agent:', request.headers['user-agent']);
      console.log('Cookies:', request.cookies);
      console.log(
        `Session ID for streaming request: ${request.session.sessionId}`
      );
      console.log(
        'streamContext:',
        request.session.streamContext ? 'Present' : 'Missing'
      );

      if (!request.session.streamContext) {
        console.error(
          `Stream context not found in session: ${request.session.sessionId}. Ensure /setup-chat-context was called and the session cookie was sent.`
        );
        return reply.code(400).send({
          error: 'Stream context not found. Ensure setup was called.'
        });
      }

      // --- Retrieve the context from session ---
      const context = request.session.streamContext;

      // --- IMPORTANT: Clear context *after* retrieval ---
      // Prevents reusing old context if client reconnects or calls /stream again erroneously
      delete request.session.streamContext;
      // If using a session store that requires explicit saving after modification:
      // await request.session.save(); // Uncomment if your store needs this

      console.log(
        `Retrieved context from session ${request.session.sessionId}, context cleared from session.`
      );
      const { chatHistory, threadId } = context;

      await addThreadMessage(threadId, chatHistory[chatHistory.length - 1]);

      // Prepend initialPrompt as a system message before chatHistory
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: initialPrompt },
        ...(Array.isArray(chatHistory) ? chatHistory : [])
      ];

      reply.sse(
        (async function* () {
          try {
            const stream = await openai.chat.completions.create({
              model: model, // e.g., 'grok-3-mini-beta'
              messages: messages,
              // max_tokens: tokenCount,
              stream: true
            });

            let eventCounter = 0;
            let fullOutput = '';
            for await (const chunk of stream) {
              eventCounter++;
              const sseId = `${request.session.sessionId}-${eventCounter}`;
              // Only send the content field, if present
              const content = chunk.choices?.[0]?.delta?.content;
              if (content) {
                fullOutput += content;
                yield {
                  id: sseId,
                  event: 'message',
                  data: JSON.stringify({ content })
                };
              }
            }
            // After stream ends, print/log the full output
            console.log(
              'Final OpenAI output for session',
              request.session.sessionId,
              ':',
              fullOutput
            );

            await addThreadMessage(threadId, {
              role: 'assistant',
              content: fullOutput
            });

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
