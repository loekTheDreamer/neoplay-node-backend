import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config/env';
import { saveGameFile } from './saveGameFile';

export interface GameFiles {
  filename: string;
  code: string;
  type: string;
}

export type SaveGameRequest = {
  gameFiles: GameFiles[];
  address: string;
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

  fastify.post('/delete', async (request, reply) => {});
}
