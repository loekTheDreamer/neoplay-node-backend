import OpenAI from 'openai';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config/env';
import { initialPrompt } from '../../prompts/xaiPrompts';

// Inline type for OpenAI ChatCompletionMessageParam
// (role: 'system' | 'user' | 'assistant', content: string)
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { authMiddleware } from '../../middleware/auth';

import { getPublishedGames, publish } from './publishHelpers';
import { JwtPayload } from 'jsonwebtoken';

type PublishGameRequest = {
  name: string;
  genre: string;
  description: string;
  tags: string;
  coverImage: string;
  id: string;
};

export function registerPublishRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/publish',
    {
      preHandler: authMiddleware
    },
    async (request, reply) => {
      console.log('ddude we are here?');
      const user = (request as any).user as JwtPayload;
      console.log('user:', user);
      if (!user || !user.id) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      const body = request.body as PublishGameRequest;

      const { name, genre, description, tags, coverImage, id } = body;

      if (!user.address) {
        return reply.code(400).send({
          error: 'Missing or invalid address in request body'
        });
      }

      if (!name) {
        return reply.code(400).send({
          error: 'Missing or invalid title in request body'
        });
      }

      try {
        await publish({
          address: user.address,
          name,
          genre,
          description,
          tags,
          coverImage,
          reply,
          id
        });
        return reply.code(200).send({ published: true });
        // return reply.send({ success: true });
      } catch (err) {
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );
  fastify.get(
    '/publish',
    {
      preHandler: authMiddleware
    },
    async (request, reply) => {
      console.log('ddude we are here?');
      const user = (request as any).user as JwtPayload;
      console.log('user:', user);
      if (!user || !user.id) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      try {
        const publishedGames = await getPublishedGames();

        return reply.code(200).send({ publishedGames });
        // return reply.send({ success: true });
      } catch (err) {
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );
}
