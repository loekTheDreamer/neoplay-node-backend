import Anthropic from '@anthropic-ai/sdk';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
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
console.log('USING MODEL:', model);
let tokenCount = 0;

if (model === 'claude-3-5-haiku-20241022') {
  tokenCount = 20000;
} else {
  tokenCount = 8192;
}

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
      max_tokens: tokenCount,
      // max_tokens: tokenCount = 8192;, // claude-3-7-sonnet

      // max_tokens: 8192, // claude-3-5-haiku
      messages: chatHistory,
      model: model,
      system: systemPrompt
    });

    // console.log('response:', response);

    return response;
  });

  // === Setup Endpoint (POST) - Stores context in session ===
  fastify.post(
    '/setup-chat-context',
    async (
      request: FastifyRequest<{ Body: ChatRequest }>,
      reply: FastifyReply
    ) => {
      console.log('/setup-chat-context request received...');
      try {
        const { chatHistory, systemPrompt } = request.body;

        if (!chatHistory || chatHistory.length === 0) {
          reply.code(400).send({ error: 'chatHistory is required' });
          return;
        }

        // --- Store context directly in the session ---
        request.session.streamContext = {
          chatHistory,
          systemPrompt
        };
        // Session plugin handles saving and sending the cookie automatically
        console.log(
          `Stored context in session ID: ${request.session.sessionId}`
        );

        reply.code(200).send({
          success: true,
          message: 'Chat context ready for streaming.'
        });
      } catch (error: any) {
        console.error('Error in /setup-chat-context:', error);
        request.log.error(error); // Use Fastify logger
        reply.code(500).send({
          error: 'Failed to setup chat context',
          details: error.message
        });
      }
    }
  );
  // SSE stream endpoint
  fastify.get(
    '/stream',
    async (request: FastifyRequest, reply: FastifyReply) => {
      console.log(
        `/stream GET request received for session ID: ${request.session.sessionId}`
      );

      // --- Retrieve the context from session ---
      const context = request.session.streamContext;

      if (!context) {
        console.log(
          `Stream context not found in session: ${request.session.sessionId}`
        );
        // Explicitly tell client context is missing, maybe setup wasn't called?
        reply.raw.writeHead(400, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache' // Prevent caching of this error response
          // 'Connection': 'close' // Optionally signal connection close immediately
        });
        reply.raw.end('Chat context not found in session. Please setup first.');
        return; // Stop processing
      }

      // --- IMPORTANT: Clear the context from session after retrieving ---
      // Prevents re-using the same chat context if /stream is called again
      // without calling /setup-chat-context first in the same session.
      delete request.session.streamContext;
      // Alternatively: request.session.streamContext = undefined;
      // Need to ensure session gets saved after deletion if store requires explicit save
      // await request.session.save(); // May not be needed depending on store/config

      console.log(
        `Retrieved context from session ${request.session.sessionId}, context cleared.`
      );
      const { chatHistory, systemPrompt } = context;

      let eventCounter = 0; // Counter for SSE 'id' field

      try {
        // --- Set Headers for SSE ---
        // CORS headers are handled by the plugin. Only set SSE-specific headers.
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
          // DO NOT set Access-Control-Allow-Origin etc. here - use the plugin
        });
        console.log(
          `SSE headers sent for session ${request.session.sessionId}. Waiting for AI stream...`
        );

        // --- Call the AI Streaming API ---
        const stream = await client.messages.create({
          max_tokens: tokenCount,
          // max_tokens: 20000, // claude-3-7-sonnet
          // max_tokens: 8192,

          messages: chatHistory,
          model: model,
          system: systemPrompt,
          stream: true
        }); // Use retrieved context

        // --- Iterate and Send Events ---
        for await (const event of stream) {
          eventCounter++;
          // Use session ID + counter for a relatively unique event ID
          const sseId = `${request.session.sessionId}-${eventCounter}`;

          const sseFormattedEvent = `id: ${sseId}\nevent: ${
            event.type
          }\ndata: ${JSON.stringify(event)}\n\n`; // i dont want to do this i want the original data

          if (!reply.raw.writable) {
            console.log(
              `Stream for session ${request.session.sessionId} closed by client.`
            );
            break;
          }
          if (!reply.raw.write(sseFormattedEvent)) {
            /* handle backpressure */
          }
        }

        // --- Signal Stream End ---
        if (reply.raw.writable) {
          const endEvent = `id: ${
            request.session.sessionId
          }-end\nevent: end\ndata: ${JSON.stringify({
            message: 'Stream finished'
          })}\n\n`;
          reply.raw.write(endEvent);
          console.log(
            `Sent SSE 'end' event for session ${request.session.sessionId}`
          );
        }
      } catch (error: any) {
        console.error(
          `Error during streaming for session ${request.session.sessionId}:`,
          error
        );
        if (reply.raw.writable) {
          // Send error event
        }
      } finally {
        // --- Ensure Connection Closure ---
        if (reply.raw.writable) {
          reply.raw.end();
          console.log(
            `/stream connection ended for session ${request.session.sessionId}.`
          );
        }
      }
      // Do not call reply.send() here
    }
  );

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
  // fastify.post('/init-stream', async (request, reply) => {
  //   const sessionId = uuidv4(); // implement this
  //   const { chatHistory, systemPrompt } = request.body as ChatRequest;

  //   // Store the chat data for this session
  //   sessions.set(sessionId, { chatHistory, systemPrompt });

  //   return { sessionId };
  // });

  // fastify.get('/stream', async (request, reply) => {
  //   const { sessionId } = request.query;
  //   const sessionData = sessions.get(sessionId);

  //   if (!sessionData) {
  //     reply.code(404).send({ error: 'Session not found' });
  //     return;
  //   }

  //   // Set SSE headers
  //   reply.raw.writeHead(200, {
  //     'Content-Type': 'text/event-stream',
  //     'Cache-Control': 'no-cache',
  //     Connection: 'keep-alive'
  //   });

  //   try {
  //     const stream = await client.messages.create({
  //       max_tokens: 8192,
  //       messages: sessionData.chatHistory,
  //       model: model,
  //       stream: true
  //     });

  //     for await (const messageStreamEvent of stream) {
  //       if (messageStreamEvent.type === 'content_block_delta') {
  //         reply.raw.write(
  //           `data: ${JSON.stringify(messageStreamEvent.delta)}\n\n`
  //         );
  //       }
  //     }

  //     reply.raw.write('data: [DONE]\n\n');
  //     sessions.delete(sessionId); // Clean up the session
  //   } catch (error) {
  //     console.error('Stream error:', error);
  //     reply.raw.write(
  //       `data: ${JSON.stringify({ error: 'An error occurred' })}\n\n`
  //     );
  //   }
  // });
}
