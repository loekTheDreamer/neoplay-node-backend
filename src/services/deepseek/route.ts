import OpenAI from 'openai';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import { initialPrompt } from '../../prompts/xaiPrompts.js';
import { authMiddleware } from '../../middleware/auth.js';
import { addThreadMessage } from '../game/gameHelpers.js';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

interface ChatRequest {
  chatHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  systemPrompt?: string;
  threadId: string;
  selectedAgent?: string; // optional, in case caller passes agent name
}

// Configure OpenAI SDK to talk to DeepSeek-compatible endpoint
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com/v1'
});

// Default model; callers can switch by sending selectedAgent === 'deepseek-reasoner'
const defaultModel = 'deepseek-chat';
const reasonerModel = 'deepseek-reasoner';

// Normalize chat history into OpenAI-compatible message array
const buildMessages = (
  chatHistory: ChatMessage[],
  systemPrompt?: string
): ChatCompletionMessageParam[] => {
  const sanitized = Array.isArray(chatHistory)
    ? chatHistory.map(({ role, content }) => ({ role, content }))
    : [];

  const sys = systemPrompt ?? initialPrompt;
  const systemMessage: ChatCompletionMessageParam = {
    role: 'system',
    content: sys
  };
  return [systemMessage, ...sanitized] as ChatCompletionMessageParam[];
};

export function registerDeepseekRoutes(fastify: FastifyInstance) {
  // 1) Setup endpoint to stash request context in the session
  fastify.post(
    '/setup-deepseek-stream',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = (request as any).user;
      if (!user || !user.id) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const { chatHistory, systemPrompt, threadId, selectedAgent } =
        request.body as ChatRequest;

      (request as any).session.streamContext = {
        chatHistory,
        systemPrompt,
        threadId,
        selectedAgent
      };

      await (request as any).session.save();

      return reply.code(200).send({
        success: true,
        sessionId: (request as any).session.sessionId
      });
    }
  );

  // 2) SSE streaming endpoint
  fastify.get(
    '/deepseek-stream',
    // Leave unauthenticated to avoid cookie forwarding complications during SSE
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session: any = (request as any).session;
      if (!session.streamContext) {
        return reply
          .code(400)
          .send({ error: 'Stream context not found. Ensure setup was called.' });
      }

      const context = session.streamContext;
      delete session.streamContext;

      const { chatHistory, threadId, systemPrompt, selectedAgent } = context as {
        chatHistory: ChatMessage[];
        threadId: string;
        systemPrompt?: string;
        selectedAgent?: string;
      };

      // Persist the latest user message before streaming response
      if (Array.isArray(chatHistory) && chatHistory.length > 0) {
        await addThreadMessage(threadId, chatHistory[chatHistory.length - 1]);
      }

      // Pick model
      const model = selectedAgent === 'deepseek-reasoner' ? reasonerModel : defaultModel;

      const messages = buildMessages(chatHistory as any, systemPrompt);

      reply.sse(
        (async function* () {
          try {
            const stream = await deepseek.chat.completions.create({
              model,
              messages,
              stream: true
            });

            let eventCounter = 0;
            let fullOutput = '';

            for await (const chunk of stream) {
              eventCounter++;
              const sseId = `${session.sessionId}-${eventCounter}`;

              if ('choices' in chunk && Array.isArray(chunk.choices)) {
                const content = (chunk as any).choices?.[0]?.delta?.content;
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

            // Save assistant response after stream completes
            await addThreadMessage(threadId, {
              role: 'assistant',
              content: fullOutput
            });

            // Emit explicit done event
            yield {
              id: `${session.sessionId}-done`,
              event: 'done',
              data: JSON.stringify({ done: true })
            };
          } catch (error: any) {
            yield {
              event: 'error',
              data: JSON.stringify({
                error: 'Streaming error occurred',
                details: error?.message || 'Unknown error'
              })
            };
          }
        })()
      );
    }
  );
}

