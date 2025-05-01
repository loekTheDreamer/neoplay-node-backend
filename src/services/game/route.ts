import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config/env';
import prisma from '../db/prisma';
import {
  addThread,
  createGame,
  upsertGameFile,
  deleteGame,
  getPublishedGames,
  getThreadById,
  publish,
  saveCurrentGame,
  updateGameName,
  getLatestGame,
  updateLocalServerWithGame
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
  gameId: string;
};

export type AddThreadRequest = {
  gameId: string;
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

interface CreateGameFilesRequest {
  gameId: string;
}

export function registerGameRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/game',
    { preHandler: authMiddleware },
    async (request, reply) => {
      console.log('/game...');
      // publisherId comes from the JWT payload
      const user = (request as any).user;
      if (!user || !user.id) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      try {
        const gameWithThread = await createGame(user.id);
        if (!gameWithThread) {
          // just returning the fact that there is no new game project created becasue the user
          // has not made any games yet.
          return reply.code(200).send({ success: false });
        }
        reply.code(201).send(gameWithThread);
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

      const threadId = (request.query as any).threadId;
      console.log('Received threadId:', threadId);

      try {
        console.log('user.id:', user.id);
        console.log('threadId:', threadId);
        // Check all games for this user to see if any have the threadId
        const allGames = await prisma.game.findMany({
          where: { publisherId: user.id },
          include: { threads: { select: { id: true } } }
        });
        // console.log(
        //   'All games for user:',
        //   allGames.map((game) => ({
        //     id: game.id,
        //     threadIds: game.threads.map((t) => t.id)
        //   }))
        // );

        const { latestGame, gameList } = await getLatestGame({
          threadId,
          userId: user.id,
          reply
        });

        // this is for the first run. we then update the front end
        // with the threadId so we will always have one after first user
        if (threadId) {
          await updateLocalServerWithGame({ threadId, user, reply });
        }
        // i need to update the server with the game threadId of the active game
        //

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
        const { gameFiles, gameId } = body;

        // Get the address from the authenticated user data
        const user = (request as any).user as JwtPayload;
        const address = user.address;

        if (!gameFiles || !Array.isArray(gameFiles) || gameFiles.length === 0) {
          return reply.code(400).send({
            error: 'Missing or invalid gameFiles array in request body'
          });
        }

        // Save each file
        await saveCurrentGame({ gameFiles, address, reply });
        await upsertGameFile({ gameId, gameFiles });

        return reply.code(200).send({ success: true });
      } catch (err) {
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );

  fastify.post(
    '/game/thread',
    {
      preHandler: authMiddleware
    },
    async (request, reply) => {
      console.log('registerGameRoutes...');
      try {
        const user = (request as any).user as JwtPayload;
        console.log('user:', user);
        if (!user || !user.id) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        const body = request.body as AddThreadRequest;
        const { gameId } = body;

        if (!gameId) {
          return reply.code(400).send({ error: 'Missing gameId' });
        }
        console.log('gameId:', gameId);
        const { id, codeBlocks } = await addThread(gameId, user.id);

        return reply.code(200).send({ success: true, id: id, codeBlocks });
      } catch (err) {
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );
  fastify.get(
    '/game/thread',
    {
      preHandler: authMiddleware
    },
    async (request, reply) => {
      try {
        const user = (request as any).user as JwtPayload;
        if (!user || !user.id) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        const id = (request.query as any).id;
        if (!id) {
          return reply.code(400).send({ error: 'Missing threadId' });
        }

        const thread = await getThreadById(id);

        if (!thread) {
          return reply.code(404).send({ error: 'Thread not found' });
        }
        await updateLocalServerWithGame({ threadId: id, user: user, reply });
        return reply.code(200).send(thread);
      } catch (err) {
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );

  // Todo remove this affter testing
  fastify.post(
    '/files/create',
    {
      preHandler: authMiddleware
    },
    async (request, reply) => {
      try {
        // const user = (request as any).user as JwtPayload;
        // if (!user || !user.id) {
        //   return reply.code(401).send({ error: 'Unauthorized' });
        // }
        // const body = request.body as CreateGameFilesRequest;
        // const { gameId } = body;
        // await upsertGameFile(gameId);
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

  fastify.post(
    '/publish',
    {
      preHandler: authMiddleware
    },
    async (request, reply) => {
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
    }
  );

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
