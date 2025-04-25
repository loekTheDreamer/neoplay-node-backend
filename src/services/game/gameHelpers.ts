import * as path from 'path';
import { promises as fsp, existsSync } from 'fs';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { GameFiles } from './route';
import { FastifyReply } from 'fastify/types/reply';
import { v4 as uuidv4 } from 'uuid';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../config/env';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const s3 = new S3Client({
  endpoint: config.SEVALLA_ENDPOINT,
  region: 'auto', // 'auto' for S3-compatible services like R2
  credentials: {
    accessKeyId: config.SEVALLA_ACCESS_KEY_ID || '',
    secretAccessKey: config.SEVALLA_SECRET_ACCESS_KEY || ''
  },
  forcePathStyle: true
});

// List objects for debugging (optional, can remove in production)
(async () => {
  try {
    const data = await s3.send(
      new ListObjectsV2Command({
        Bucket: config.SEVALLA_BUCKET_NAME || 'your-bucket-name'
      })
    );
    if ('Contents' in data) {
      console.log('Objects:', data.Contents);
    } else {
      console.log('No objects found or unexpected response:', data);
    }
  } catch (err) {
    console.log('Error:', err);
  }
})();

interface SaveGameFileRequest {
  gameFiles: GameFiles[];
  address: string;
  reply: FastifyReply;
}

interface PublishGameRequest {
  address: string;
  title: string;
  id?: string;
  reply: FastifyReply;
}

const contentType = (filename: string) => {
  if (filename.endsWith('.html')) {
    return 'text/html';
  }
  if (filename.endsWith('.js')) {
    return 'application/javascript';
  }
  if (filename.endsWith('.css')) {
    return 'text/css';
  }
  if (filename.endsWith('.svg')) {
    return 'image/svg+xml';
  }
  return 'application/octet-stream';
};

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
    // Prepare upload promises for all files
    const uploadPromises = gameFiles.map(async ({ filename, code }) => {
      if (
        !filename ||
        typeof filename !== 'string' ||
        !code ||
        typeof code !== 'string'
      ) {
        reply.code(400).send({ error: 'Invalid file object in gameFiles' });
        return;
      }

      const command = new PutObjectCommand({
        Bucket: config.SEVALLA_BUCKET_NAME || 'your-bucket-name',
        Key: `current_game/${address}/${filename}`,
        Body: code,
        ContentType: contentType(filename)
      });
      try {
        await s3.send(command);
        console.log('Upload Success:', filename);
      } catch (err) {
        console.log('Upload Error:', err);
        throw err;
      }
    });
    console.log('begin upload...');
    await Promise.all(uploadPromises);
    reply.code(200).send({ success: true });
  } catch (error) {
    console.log('error saving file:', error);
  }
}

export async function serveCurrentGame(address: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: config.SEVALLA_BUCKET_NAME,
    Key: `current_game/${address}`
  });
  const url = await getSignedUrl(s3, command, { expiresIn: 60 * 60 }); // 1 hour
  console.log('url:', url);
  return url;
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
  id,
  reply
}: PublishGameRequest): Promise<any> {
  try {
    console.log('Incoming id:', id);
    const gameId = id && typeof id === 'string' && id.trim() !== '' ? id.trim() : uuidv4();
    console.log('Resolved gameId:', gameId);
    const bucket = config.SEVALLA_BUCKET_NAME || 'your-bucket-name';
    const srcPrefix = `current_game/${address}/`;
    const destPrefix = `published/${gameId}/`;

    // 1. List all files under current_game/{address}/
    const listResp = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: srcPrefix
    }));
    if (!listResp.Contents || listResp.Contents.length === 0) {
      reply.code(404).send({ error: 'No files found for this game' });
      return;
    }

    // 2. Copy each file to published/{gameId}/
    const copyPromises = listResp.Contents.filter(obj => !!obj.Key && !obj.Key.endsWith('/')).map(async obj => {
      const srcKey = obj.Key!;
      const relativeKey = srcKey.substring(srcPrefix.length);
      const destKey = destPrefix + relativeKey;
      try {
        await s3.send(new CopyObjectCommand({
          Bucket: bucket,
          CopySource: `${bucket}/${srcKey}`,
          Key: destKey
        }));
        console.log(`Copied ${srcKey} to ${destKey}`);
      } catch (err) {
        console.log('Copy error:', err);
        throw err;
      }
    });
    await Promise.all(copyPromises);

    // 3. Update public/games.json on disk (not S3)
    const publicDir = path.resolve(__dirname, '../../../public');
    const gamesJsonPath = path.join(publicDir, 'games.json');
    let games: any[] = [];
    if (existsSync(gamesJsonPath)) {
      const data = await fsp.readFile(gamesJsonPath, 'utf-8');
      try {
        games = JSON.parse(data);
        if (!Array.isArray(games)) games = [];
      } catch {
        games = [];
      }
    }
    const info = { author: address, title, id: gameId, date: new Date() };
    const existingIndex = games.findIndex(
      (g: any) => typeof g.id === 'string' && g.id.trim() === gameId
    );
    if (existingIndex !== -1) {
      games[existingIndex].updated = new Date();
      console.log('Updated existing entry with id:', gameId);
    } else {
      games.push(info);
      console.log('Added new entry with id:', gameId);
    }
    await fsp.writeFile(gamesJsonPath, JSON.stringify(games, null, 2), 'utf-8');

    return { id: gameId };

  } catch (error) {
    console.log('error publishing game:', error);
    reply.code(500).send({ error: 'Error publishing game', details: error });
  }
}


// export async function publish({
//   address,
//   title,
//   id,
//   reply
// }: PublishGameRequest): Promise<any> {
//   try {
//     console.log('Incoming id:', id);
//     const gameId =
//       id && typeof id === 'string' && id.trim() !== '' ? id.trim() : uuidv4();
//     console.log('Resolved gameId:', gameId);

//     const srcDir = path.resolve(
//       __dirname,
//       `../../../public/currentGame/${address}`
//     );
//     const destDir = path.resolve(
//       __dirname,
//       `../../../public/published/${gameId}`
//     );
//     console.log('title:', title);
//     if (!existsSync(srcDir)) {
//       reply.status(404).send({ error: 'Game not found' });
//       return;
//     }
//     // // Prevent overwriting if the title already exists
//     // if (existsSync(destDir)) {
//     //   reply.status(409).send({ error: 'Title already exists' });
//     //   return;
//     // }

//     // Copy directory recursively
//     await fsp.mkdir(destDir, { recursive: true });
//     // Node.js 16+ has fsp.cp, fallback if not available
//     if (typeof fsp.cp === 'function') {
//       await (fsp as any).cp(srcDir, destDir, { recursive: true });
//     } else {
//       // Fallback: copy files manually (simple implementation)
//       const copyRecursive = async (src: string, dest: string) => {
//         const entries = await fsp.readdir(src, { withFileTypes: true });
//         for (const entry of entries) {
//           const srcPath = path.join(src, entry.name);
//           const destPath = path.join(dest, entry.name);
//           if (entry.isDirectory()) {
//             await fsp.mkdir(destPath, { recursive: true });
//             await copyRecursive(srcPath, destPath);
//           } else {
//             await fsp.copyFile(srcPath, destPath);
//           }
//         }
//       };
//       await copyRecursive(srcDir, destDir);
//     }

//     // Update published/games.json with new game info
//     const info = { author: address, title, id: gameId, date: new Date() };
//     const publishedDir = path.resolve(__dirname, '../../../public/published');
//     const gamesJsonPath = path.join(publishedDir, 'games.json');
//     let games: any[] = [];
//     if (existsSync(gamesJsonPath)) {
//       const data = await fsp.readFile(gamesJsonPath, 'utf-8');
//       try {
//         games = JSON.parse(data);
//         if (!Array.isArray(games)) games = [];
//       } catch {
//         games = [];
//       }
//     }
//     // Log all ids in games.json before checking
//     console.log(
//       'Existing ids in games.json:',
//       games.map((g) => g.id)
//     );
//     // Check if the id exists (robust: trim string for comparison)
//     const existingIndex = games.findIndex(
//       (g) => typeof g.id === 'string' && g.id.trim() === gameId
//     );
//     if (existingIndex !== -1) {
//       // Update the 'updated' field with the current timestamp
//       games[existingIndex].updated = new Date();
//       console.log('Updated existing entry with id:', gameId);
//     } else {
//       games.push(info);
//       console.log('Added new entry with id:', gameId);
//     }
//     await fsp.writeFile(gamesJsonPath, JSON.stringify(games, null, 2), 'utf-8');
//     return { id: gameId };
//   } catch (error) {
//     console.log('error publishing game:', error);
//   }
// }

export async function getPublishedGames() {
  try {
    const games = await fsp.readFile(
      path.resolve(__dirname, '../../../public/published/games.json'),
      'utf-8'
    );
    console.log('games:', games);
    return games;
  } catch (err) {
    console.log('error fetching published games:', err);
  }
}
