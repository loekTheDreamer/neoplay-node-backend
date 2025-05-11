import OpenAI from 'openai';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Anthropic from '@anthropic-ai/sdk';

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
  selectedAgent: string;
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

const client = new Anthropic({
  apiKey: config.anthropicSecretKey
});

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

const correctMessageShape = (selectedAgent: string, chatHistory: any[]) => {
  // Remove 'id' property from each chatHistory element
  const sanitizedHistory = Array.isArray(chatHistory)
    ? chatHistory.map(({ id, senderId, createdAt, ...rest }) => rest)
    : [];
  if (selectedAgent === 'grok') {
    return [{ role: 'system', content: initialPrompt }, ...sanitizedHistory];
  } else if (selectedAgent === 'claude-3') {
    return sanitizedHistory as ClaudeMessage[];
  }
  // Default: return an empty array to satisfy type expectations
  return [];
};

export function registerXaiRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/setup-xai-stream',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = (request as any).user;

      if (!user || !user.id) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      const { chatHistory, systemPrompt, threadId, selectedAgent } =
        request.body as ChatRequest;
      request.session.streamContext = {
        chatHistory,
        systemPrompt,
        threadId,
        selectedAgent
      };

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
      const { chatHistory, threadId, selectedAgent } = context;

      await addThreadMessage(threadId, chatHistory[chatHistory.length - 1]);

      // Prepend initialPrompt as a system message before chatHistory
      const messages: ChatCompletionMessageParam[] | ClaudeMessage[] =
        correctMessageShape(selectedAgent, chatHistory);

      console.log('selectedAgent:', selectedAgent);

      reply.sse(
        (async function* () {
          try {
            let stream;
            if (selectedAgent === 'grok') {
              stream = await openai.chat.completions.create({
                model: model, // e.g., 'grok-3-mini-beta'
                messages: messages,
                // max_tokens: tokenCount,
                stream: true
              });
            } else if (selectedAgent === 'claude-3') {
              stream = await client.messages.create({
                // max_tokens: 8192,
                max_tokens: 20000,
                messages: messages as ClaudeMessage[],
                // model: 'claude-3-5-haiku-20241022',
                model: 'claude-3-7-sonnet-20250219',
                system: initialPrompt,
                stream: true
              });
            } else {
              reply.code(400).send({ error: 'Unknown agent selected.' });
              return;
            }

            let eventCounter = 0;
            let fullOutput = '';
            if (selectedAgent === 'grok') {
              for await (const chunk of stream) {
                eventCounter++;
                const sseId = `${request.session.sessionId}-${eventCounter}`;
                // Only handle chunks that have 'choices'
                if ('choices' in chunk && Array.isArray(chunk.choices)) {
                  const content = chunk.choices[0]?.delta?.content;
                  if (content) {
                    fullOutput += content;
                    yield {
                      id: sseId,
                      event: 'message',
                      data: JSON.stringify({ content })
                    };
                  }
                }
              }
            } else if (selectedAgent === 'claude-3') {
              for await (const event of stream) {
                eventCounter++;
                const sseId = `${request.session.sessionId}-${eventCounter}`;
                // Only send the content field, if present
                let content;
                if ('type' in event && event.type === 'content_block_delta') {
                  if (
                    event.delta &&
                    'text' in event.delta &&
                    typeof event.delta.text === 'string'
                  ) {
                    content = event.delta.text;
                  }
                }

                if (content) {
                  fullOutput += content;
                  yield {
                    id: sseId,
                    event: 'message',
                    data: JSON.stringify({ content })
                  };
                }
              }
            }

            // After stream ends, print/log the full output

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
