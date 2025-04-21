import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config/env';
import { saveGameFile } from './saveGameFile';

interface GameFiles {
  filename: string;
  code: string;
  type: string;
}

type SaveGameRequest = {
  gameFiles: GameFiles[];
};

export function registerGameRoutes(fastify: FastifyInstance) {
  fastify.post('/save', async (request, reply) => {
    console.log('registerGameRoutes...');
    try {
      const body = request.body as SaveGameRequest;

      console.log('body:', body);
      if (
        !body ||
        !Array.isArray(body.gameFiles) ||
        body.gameFiles.length === 0
      ) {
        return reply.status(400).send({
          error: 'Missing or invalid gameFiles array in request body'
        });
      }

      // Save each file
      for (const fileObj of body.gameFiles) {
        if (
          !fileObj.filename ||
          typeof fileObj.filename !== 'string' ||
          !fileObj.code ||
          typeof fileObj.code !== 'string'
        ) {
          return reply
            .status(400)
            .send({ error: 'Invalid file object in gameFiles' });
        }
        console.log('go save it');
        await saveGameFile(fileObj.filename, fileObj.code);
      }
      return reply.send({ success: true });
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  //   fastify.post('/delete', async (request, reply) => {});
}
