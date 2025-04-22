import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { GameFiles } from './route';
import { FastifyReply } from 'fastify/types/reply';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SaveGameFileRequest {
  gameFiles: GameFiles[];
  address: string;
  reply: FastifyReply;
}

/**
 * Saves the provided code to a file in public/currentGame.
 * @param file - The filename to save as (e.g. 'main.js')
 * @param code - The code/content to write to the file
 * @throws Will throw if writing fails
 */
export async function saveGameFile({
  gameFiles,
  address,
  reply
}: SaveGameFileRequest): Promise<void> {
  try {
    for (const fileObj of gameFiles) {
      const { filename, code } = fileObj;
      if (
        !filename ||
        typeof filename !== 'string' ||
        !code ||
        typeof code !== 'string'
      ) {
        return reply
          .status(400)
          .send({ error: 'Invalid file object in gameFiles' });
      }
      console.log('go save it');

      console.log('here');
      const dir = path.resolve(
        __dirname,
        `../../../public/currentGame/${address}`
      );

      console.log('dir:', dir);
      console.log('file:', filename);
      console.log('code:', code);

      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, filename);
      await fs.writeFile(filePath, code, 'utf8');
    }
  } catch (error) {
    console.log('error saving file:', error);
  }
}
