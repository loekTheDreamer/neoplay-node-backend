import * as path from 'path';
import { promises as fsp, existsSync } from 'fs';
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

interface PublishGameRequest {
  address: string;
  title: string;
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

      await fsp.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, filename);
      await fsp.writeFile(filePath, code, 'utf8');
    }
  } catch (error) {
    console.log('error saving file:', error);
  }
}

export async function deleteGame(address: string): Promise<void> {
  try {
    const dir = path.resolve(
      __dirname,
      `../../../public/currentGame/${address}`
    );
    if (!existsSync(dir)) {
      return;
    }
    await fsp.rm(dir, { recursive: true, force: true });
  } catch (error) {
    console.log('error deleting game:', error);
  }
}

export async function publish({
  address,
  title,
  reply
}: PublishGameRequest): Promise<void> {
  try {
    const srcDir = path.resolve(
      __dirname,
      `../../../public/currentGame/${address}`
    );
    const destDir = path.resolve(
      __dirname,
      `../../../public/published/${title}`
    );
    if (!existsSync(srcDir)) {
      reply.status(404).send({ error: 'Game not found' });
      return;
    }
    // Prevent overwriting if the title already exists
    if (existsSync(destDir)) {
      reply.status(409).send({ error: 'Title already exists' });
      return;
    }

    // Copy directory recursively
    await fsp.mkdir(destDir, { recursive: true });
    // Node.js 16+ has fsp.cp, fallback if not available
    if (typeof fsp.cp === 'function') {
      await (fsp as any).cp(srcDir, destDir, { recursive: true });
    } else {
      // Fallback: copy files manually (simple implementation)
      const copyRecursive = async (src: string, dest: string) => {
        const entries = await fsp.readdir(src, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          if (entry.isDirectory()) {
            await fsp.mkdir(destPath, { recursive: true });
            await copyRecursive(srcPath, destPath);
          } else {
            await fsp.copyFile(srcPath, destPath);
          }
        }
      };
      await copyRecursive(srcDir, destDir);
    }

    // Create info.json
    const info = { author: address, title };
    const infoPath = path.join(destDir, 'info.json');
    await fsp.writeFile(infoPath, JSON.stringify(info, null, 2), 'utf-8');
  } catch (error) {
    console.log('error publishing game:', error);
  }
}
