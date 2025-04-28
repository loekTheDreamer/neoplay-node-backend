import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config/env';
import {
  deleteGame,
  getPublishedGames,
  publish,
  saveCurrentGame
} from './gameHelpers';
import { promises as fsp } from 'fs';
import * as path from 'path';
import { authMiddleware } from '../../middleware/auth';
import { JwtPayload } from '../../utils/jwt';

export interface GameFiles {
  filename: string;
  code: string;
  type: string;
}

export type SaveGameRequest = {
  gameFiles: GameFiles[];
  address?: string; // Now optional as we get it from the token
};

export type DeleteGameRequest = {
  address: string;
};

export type PublishGameRequest = {
  address: string;
  title: string;
  id?: string;
};

interface ServeCurrentGameRequest {
  address: string;
}

export function registerGameRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/save',
    {
      preHandler: [authMiddleware]
    },
    async (request, reply) => {
      console.log('registerGameRoutes...');
      try {
        const body = request.body as SaveGameRequest;
        const { gameFiles } = body;

        // Get the address from the authenticated user data
        const user = (request as any).user as JwtPayload;
        const address = user.address;

        console.log('address from token:', address);
        console.log('gameFiles:', gameFiles);

        if (!gameFiles || !Array.isArray(gameFiles) || gameFiles.length === 0) {
          return reply.code(400).send({
            error: 'Missing or invalid gameFiles array in request body'
          });
        }

        // Save each file
        await saveCurrentGame({ gameFiles, address, reply });

        return reply.code(200).send({ success: true });
      } catch (err) {
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );

  fastify.post('/delete', async (request, reply) => {
    const body = request.body as DeleteGameRequest;

    const { address } = body;

    if (!address) {
      return reply.code(400).send({
        error: 'Missing or invalid address in request body'
      });
    }

    try {
      await deleteGame(address);
      return reply.code(200).send({ success: true });
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  fastify.post('/publish', async (request, reply) => {
    const body = request.body as PublishGameRequest;

    const { address, title, id } = body;

    if (!address) {
      return reply.code(400).send({
        error: 'Missing or invalid address in request body'
      });
    }

    if (!title) {
      return reply.code(400).send({
        error: 'Missing or invalid title in request body'
      });
    }

    try {
      const gameId = await publish({ address, title, id, reply });
      return reply.code(200).send(gameId);
      // return reply.send({ success: true });
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  fastify.get('/published', async (request, reply) => {
    try {
      const games = await getPublishedGames();
      console.log('Games to send:', games);

      return reply.code(200).send(games);
    } catch (err) {
      console.log('error fetching published games:', err);
      return reply.code(500).send({ error: (err as Error).message });
    }
  });
}
