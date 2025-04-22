import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config/env';
import {
  deleteGame,
  getPublishedGames,
  publish,
  saveGameFile
} from './gameHelpers';
import { promises as fsp } from 'fs';
import * as path from 'path';

export interface GameFiles {
  filename: string;
  code: string;
  type: string;
}

export type SaveGameRequest = {
  gameFiles: GameFiles[];
  address: string;
};

export type DeleteGameRequest = {
  address: string;
};

export type PublishGameRequest = {
  address: string;
  title: string;
};

export function registerGameRoutes(fastify: FastifyInstance) {
  fastify.post('/save', async (request, reply) => {
    console.log('registerGameRoutes...');
    try {
      const body = request.body as SaveGameRequest;

      const { gameFiles, address } = body;

      console.log('address:', address);

      console.log('gameFiles:', gameFiles);

      if (!gameFiles || !Array.isArray(gameFiles) || gameFiles.length === 0) {
        return reply.status(400).send({
          error: 'Missing or invalid gameFiles array in request body'
        });
      }

      if (!address) {
        return reply.status(400).send({
          error: 'Missing or invalid address in request body'
        });
      }

      // Save each file
      await saveGameFile({ gameFiles, address, reply });

      return reply.send({ success: true });
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  fastify.post('/delete', async (request, reply) => {
    const body = request.body as DeleteGameRequest;

    const { address } = body;

    if (!address) {
      return reply.status(400).send({
        error: 'Missing or invalid address in request body'
      });
    }

    try {
      await deleteGame(address);
      return reply.send({ success: true });
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  fastify.post('/publish', async (request, reply) => {
    const body = request.body as PublishGameRequest;

    const { address, title } = body;

    if (!address) {
      return reply.status(400).send({
        error: 'Missing or invalid address in request body'
      });
    }

    if (!title) {
      return reply.status(400).send({
        error: 'Missing or invalid title in request body'
      });
    }

    try {
      await publish({ address, title, reply });
      return reply.send({ success: true });
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  fastify.get('/published', async (request, reply) => {
    try {
      const games = await getPublishedGames();
      console.log('Games to send:', games);

      return reply.code(200).send(games);
    } catch (err) {
      console.log('error fetching published games:', err);
      return reply.status(500).send({ error: (err as Error).message });
    }
  });
}
