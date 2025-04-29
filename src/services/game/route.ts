import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config/env';
import prisma from '../db/prisma';
import {
  createGame,
  deleteGame,
  getPublishedGames,
  publish,
  saveCurrentGame,
  updateGameName
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

export type Name = {
  newName: string;
  gameId: string;
};

export function registerGameRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/game',
    { preHandler: authMiddleware },
    async (request, reply) => {
      // publisherId comes from the JWT payload
      const user = (request as any).user;
      if (!user || !user.id) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      try {
        const game = await createGame(user.id);
        reply.code(201).send(game);
      } catch (error) {
        reply.code(500).send({ error: 'Failed to create game' });
      }
    }
  );

  fastify.get(
    '/game/user',
    { preHandler: authMiddleware },
    async (request, reply) => {
      console.log('/game/user');
      // publisherId comes from the JWT payload
      const user = (request as any).user;
      console.log('user:', user);
      if (!user || !user.id) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      try {
        console.log('user.id:', user.id);
        // Get the latest game for the user
        const latestGame = await prisma.game.findFirst({
          where: { publisherId: user.id },
          orderBy: { createdAt: 'desc' },
          include: {
            threads: {
              orderBy: { createdAt: 'asc' },
              take: 1,
              select: {
                id: true,
                createdAt: true,
                messages: {
                  orderBy: { createdAt: 'asc' },
                  select: {
                    id: true,
                    content: true,
                    createdAt: true,
                    role: true,
                    senderId: true
                  }
                }
              }
            }
          }
        });

        // Get all game names and published status, ordered by creation
        const gameList = await prisma.game.findMany({
          where: {
            publisherId: user.id
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
            createdAt: true,
            status: true,
            threads: {
              select: {
                id: true,
                createdAt: true,
                messages: {
                  orderBy: { createdAt: 'asc' },
                  take: 1,
                  select: {
                    id: true,
                    content: true,
                    createdAt: true,
                    role: true,
                    senderId: true
                  }
                }
              }
            }
          }
        });

        reply.code(200).send({ latestGame, gameList });
      } catch (error) {
        reply.code(500).send({ error: 'Failed to fetch games' });
      }
    }
  );

  fastify.post(
    '/game/name',
    { preHandler: authMiddleware },
    async (request, reply) => {
      console.log('/game/name...');

      const user = (request as any).user;
      if (!user || !user.id) {
        console.log('Unauthorized');
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      try {
        const body = request.body as Name;
        const { newName, gameId } = body;
        console.log('newName:', newName);
        console.log('gameId:', gameId);
        await updateGameName(gameId, newName);
        return reply.code(200).send({ success: true });
      } catch (err) {
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );

  fastify.post(
    '/game/save',
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
