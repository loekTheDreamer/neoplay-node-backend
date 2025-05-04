import Anthropic from '@anthropic-ai/sdk';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config/env.js';
// import { v4 as uuidv4 } from 'uuid';

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

// let model = 'claude-3-7-sonnet-20250219';
// const model2 = "claude-3-5-sonnet-20241022"
let model = 'claude-3-5-haiku-20241022';

console.log('USING MODEL:', model);
let tokenCount = 0;

if (model === 'claude-3-5-haiku-20241022') {
  tokenCount = 8192;
} else {
  tokenCount = 20000;
}

export function registerAnthropicRoutes(fastify: FastifyInstance) {
  // Root Route
  // fastify.get('/', async (request, reply) => {
  //   reply.send({ message: 'Anthropic Media Stream Server is running!' });
  // });

  fastify.post('/chat', async (request, reply) => {
    console.log('/chat...');

    const { chatHistory, systemPrompt } = request.body as ChatRequest;
    // console.log('chatHistory:', chatHistory);
    console.log('prompt:', systemPrompt);

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

  fastify.post('/setup-anthropic-stream', async (request, reply) => {
    // console.log('Incoming cookies:', request.cookies);
    // console.log('Session ID before:', request.session.sessionId);

    const { chatHistory, systemPrompt, threadId } = request.body as ChatRequest & { threadId: string };

    if (!threadId) {
      reply.code(400).send({ success: false, message: 'threadId is required' });
      return reply;
    }

    request.session.streamContext = { chatHistory, systemPrompt, threadId };

    // Force session to be saved and cookie to be set
    await request.session.save();

    // console.log('Session ID after:', request.session.sessionId);
    // console.log('Session data:', request.session.streamContext);

    // Log headers after setting the response
    reply.code(200).send({ success: true, message: 'Chat context ready' });
    // console.log('Response headers:', reply.getHeaders());
    return reply; // Ensure reply is returned
  });

  // fastify.post(
  //   '/setup-chat-context',
  //   (request: FastifyRequest<{ Body: ChatRequest }>, reply: FastifyReply) => {
  //     console.log('Incoming cookies:', request.cookies);
  //     console.log('Session ID before:', request.session.sessionId);
  //     request.session.streamContext = {
  //       chatHistory: request.body.chatHistory,
  //       systemPrompt: request.body.systemPrompt
  //     };
  //     console.log('Session ID after:', request.session.sessionId);
  //     reply.setCookie('session', request.session.sessionId, {
  //       // Force manual cookie for testing
  //       secure: true,
  //       httpOnly: true,
  //       sameSite: 'none',
  //       maxAge: 60 * 60 * 1000,
  //       path: '/'
  //     });
  //     console.log('Response headers:', reply.getHeaders());
  //     reply.code(200).send({ success: true, message: 'Chat context ready' });
  //   }
  // );
  // === Setup Endpoint (POST) - Stores context in session ===
  // fastify.post(
  //   '/setup-chat-context',
  //   // Removed async from route handler if not using await inside *before* replying
  //   (request: FastifyRequest<{ Body: ChatRequest }>, reply: FastifyReply) => {
  //     console.log('/setup-chat-context request received...');

  //     console.log('Cookies:', request.cookies);
  //     console.log('Session ID:', request.session.sessionId);

  //     // --- DEBUGGING START ---
  //     console.log('Session object available:', !!request.session); // Should be true
  //     console.log('Session ID at start:', request.session?.sessionId); // Log the initial ID (might be new)
  //     if (!request.session) {
  //       console.error('CRITICAL: request.session is NOT defined!');
  //       // If this happens, session middleware failed entirely. Check registration order/secret.
  //       return reply
  //         .code(500)
  //         .send({ error: 'Internal server error: Session unavailable' });
  //     }
  //     // --- DEBUGGING END ---

  //     try {
  //       const { chatHistory, systemPrompt } = request.body;

  //       if (
  //         !chatHistory ||
  //         !Array.isArray(chatHistory) ||
  //         chatHistory.length === 0
  //       ) {
  //         // Added check for array type as well
  //         return reply
  //           .code(400)
  //           .send({ error: 'chatHistory (non-empty array) is required' });
  //         // Use 'return reply...' to ensure execution stops
  //       }

  //       // Store context directly in the session
  //       // Ensure the structure matches your Session interface declaration
  //       request.session.streamContext = {
  //         chatHistory,
  //         systemPrompt // Will be undefined if not provided, which is fine
  //       };

  //       // --- DEBUGGING START ---
  //       console.log(
  //         'Session modified. streamContext:',
  //         request.session.streamContext
  //       );
  //       console.log(
  //         `Session ID *before* sending reply: ${request.session.sessionId}`
  //       );
  //       // --- DEBUGGING END ---

  //       // @fastify/session handles saving automatically on reply by default
  //       console.log(
  //         `Stored context in session ID: ${request.session.sessionId}`
  //       );
  //       // No need to await anything here unless session store requires explicit save
  //       // and you configured it that way. Default memory store or basic setups don't.
  //       // Reply - @fastify/session should add Set-Cookie header here automatically
  //       reply.code(200).send({
  //         success: true,
  //         message: 'Chat context ready for streaming.'
  //       });
  //     } catch (error: any) {
  //       console.error('Error in /setup-chat-context:', error);
  //       request.log.error(error); // Use Fastify logger
  //       // Avoid sending detailed internal errors to the client in production
  //       reply.code(500).send({
  //         error: 'Failed to setup chat context'
  //         // details: error.message // Maybe only include in dev mode
  //       });
  //     }
  //   }
  // );

  // SSE stream endpoint
  fastify.post(
    '/anthropic-stream',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Log session ID *immediately* upon receiving request
      // console.log('Cookies:', request.cookies);
      // console.log('Session ID:', request.session.sessionId);
      // console.log('Stream Context:', request.session.streamContext);
      // console.log('Headers being sent:', reply.getHeaders());

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
        // **** MODIFICATION END ****

        // V--- OLD CODE TO REMOVE ---V
        // reply.raw.writeHead(400, {
        //   'Content-Type': 'text/plain; charset=utf-8',
        //   'Cache-Control': 'no-cache'
        // });
        // reply.raw.end('Bad Request: Chat context not found in session. Please setup first.');
        // return;
        // ^--- OLD CODE TO REMOVE ---^
      }

      // --- IMPORTANT: Clear context *after* retrieval ---
      // Prevents reusing old context if client reconnects or calls /stream again erroneously
      delete request.session.streamContext;
      // If using a session store that requires explicit saving after modification:
      // await request.session.save(); // Uncomment if your store needs this

      console.log(
        `Retrieved context from session ${request.session.sessionId}, context cleared from session.`
      );
      const { chatHistory, systemPrompt } = context;
      console.log('prompt:', systemPrompt);
      console.log(
        'Headers prepared by Fastify before manual writeHead:',
        reply.getHeaders()
      );
      reply.sse(
        (async function* () {
          try {
            const stream = await client.messages.create({
              max_tokens: tokenCount,
              messages: chatHistory,
              model: model,
              system: systemPrompt,
              stream: true
            });

            let eventCounter = 0;
            for await (const event of stream) {
              eventCounter++;
              const sseId = `${request.session.sessionId}-${eventCounter}`;
              yield {
                id: sseId,
                event: event.type,
                data: JSON.stringify(event)
              };
            }

            // Send end event
            yield {
              id: `${request.session.sessionId}-end`,
              event: 'end',
              data: JSON.stringify({ message: 'Stream finished' })
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
      // try {
      //   // --- TEMPORARY DEBUG LOG ---
      //   console.log(
      //     'Headers prepared by Fastify before manual writeHead:',
      //     reply.getHeaders()
      //   );
      //   // --- END DEBUG LOG ---
      //   // --- Set Headers for SSE (using reply.raw) ---
      //   // CORS headers should be added by the plugin *before* this point
      //   // for the initial 200 response.
      //   reply.raw.writeHead(200, {
      //     'Content-Type': 'text/event-stream',
      //     'Cache-Control': 'no-cache',
      //     Connection: 'keep-alive'
      //     // NO CORS headers here - rely on the plugin
      //   });
      //   console.log(
      //     `SSE headers sent for session ${request.session.sessionId}. Waiting for AI stream...`
      //   );

      //   // --- Call the AI Streaming API ---
      //   // Ensure 'client', 'tokenCount', 'model' are defined/imported correctly
      //   const stream = await client.messages.create({
      //     max_tokens: tokenCount,
      //     messages: chatHistory,
      //     model: model,
      //     system: systemPrompt,
      //     stream: true
      //   });

      //   // --- Iterate and Send Events ---
      //   for await (const event of stream) {
      //     eventCounter++;
      //     const sseId = `${request.session.sessionId}-${eventCounter}`; // Unique ID per event in stream

      //     // Format according to SSE spec: id, event, data (multiline data needs care)
      //     // Ensure data is valid JSON before stringifying
      //     const jsonData = JSON.stringify(event);
      //     const sseFormattedEvent = `id: ${sseId}\nevent: ${event.type}\ndata: ${jsonData}\n\n`;

      //     if (!reply.raw.writableEnded && !reply.raw.write(sseFormattedEvent)) {
      //       // Handle backpressure: Wait for drain event if write returns false
      //       await new Promise((resolve) => reply.raw.once('drain', resolve));
      //     }

      //     // Check if connection closed between write and loop condition
      //     if (reply.raw.writableEnded) {
      //       console.log(
      //         `Stream for session ${request.session.sessionId} closed by client during event sending.`
      //       );
      //       break; // Exit loop if client disconnected
      //     }
      //   }

      //   // --- Signal Stream End ---
      //   if (!reply.raw.writableEnded) {
      //     const endEventData = JSON.stringify({ message: 'Stream finished' });
      //     const endEvent = `id: ${request.session.sessionId}-end\nevent: end\ndata: ${endEventData}\n\n`;
      //     reply.raw.write(endEvent);
      //     console.log(
      //       `Sent SSE 'end' event for session ${request.session.sessionId}`
      //     );
      //   }
      // } catch (error: any) {
      //   console.error(
      //     `Error during streaming for session ${request.session.sessionId}:`,
      //     error
      //   );
      //   if (!reply.raw.writableEnded) {
      //     // Optionally send an 'error' event to the client before closing
      //     try {
      //       const errorData = JSON.stringify({
      //         error: 'Streaming error occurred',
      //         details: error.message
      //       });
      //       const errorEvent = `event: error\ndata: ${errorData}\n\n`;
      //       reply.raw.write(errorEvent);
      //     } catch (writeError) {
      //       console.error('Failed to write error event to client:', writeError);
      //     }
      //   }
      // } finally {
      //   // --- Ensure Connection Closure ---
      //   if (!reply.raw.writableEnded) {
      //     reply.raw.end(); // Close the connection cleanly
      //     console.log(
      //       `/stream connection explicitly ended for session ${request.session.sessionId}.`
      //     );
      //   } else {
      //     console.log(
      //       `/stream connection was already ended for session ${request.session.sessionId}.`
      //     );
      //   }
      // }
      // IMPORTANT: Do not call reply.send() when manually handling reply.raw
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
