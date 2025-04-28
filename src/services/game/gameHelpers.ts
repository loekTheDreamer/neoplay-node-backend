import * as path from 'path';
import { promises as fsp, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { GameFiles } from './route';
import { FastifyReply } from 'fastify/types/reply';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../../config/env';
import prisma from '../db/prisma';
import { ChatCompletionMessageParam } from 'openai/resources.mjs';

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

export const createGame = async (userId: string) => {
  try {
    const game = await prisma.game.create({
      data: {
        name: 'Untitled Game',
        genre: 'Unknown',
        description: '',
        coverImageUrl: '',
        publisherId: userId,
        tags: []
      }
    });

    // Create an initial thread for the game
    await prisma.thread.create({
      data: {
        gameId: game.id,
        userId: userId
      }
    });

    return game;
  } catch (error) {
    console.log('error creating game:', error);
    throw error;
  }
};

export async function saveCurrentGame({
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
      // Compute the full file path for this file (including any nested directories in filename)
      const baseDir = path.resolve(
        __dirname,
        `../../../public/currentGame/${address}`
      );
      const filePath = path.join(baseDir, filename);
      const fileDir = path.dirname(filePath);

      // Ensure the directory exists (recursive for dynamic/nested dirs)
      await fsp.mkdir(fileDir, { recursive: true });

      // Save the file
      await fsp.writeFile(filePath, code, 'utf8');

      console.log('Saved file to:', filePath);
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
  id,
  reply
}: PublishGameRequest): Promise<any> {
  try {
    console.log('Incoming id:', id);
    const gameId =
      id && typeof id === 'string' && id.trim() !== '' ? id.trim() : uuidv4();
    console.log('Resolved gameId:', gameId);
    const bucket = config.SEVALLA_BUCKET_NAME || 'your-bucket-name';
    const srcDir = path.resolve(
      __dirname,
      `../../../public/currentGame/${address}`
    );
    const destPrefix = `published/${gameId}/`;

    // 1. List all files under public/currentGames/{address}/
    let files: string[] = [];
    console.log('here:', files);
    try {
      files = await fsp.readdir(srcDir);
      console.log('files:', files);
    } catch (err) {
      reply.code(404).send({ error: 'No files found for this game' });
      return;
    }
    if (!files || files.length === 0) {
      reply.code(404).send({ error: 'No files found for this game' });
      return;
    }
    console.log('fuck you');
    // 2. Upload each file to published/{gameId}/ in S3
    const copyPromises = files.map(async (file) => {
      const filePath = path.join(srcDir, file);
      const destKey = destPrefix + file;
      try {
        const fileContent = await fsp.readFile(filePath);
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: destKey,
            Body: fileContent
          })
        );
        console.log(`Uploaded ${filePath} to ${destKey}`);
      } catch (err) {
        console.log('Upload error:', err);
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
    console.error('Error publishing game:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    reply.code(500).send({
      error: 'Error publishing game',
      details: error instanceof Error ? error.message : error
    });
  }
}

export const updateGameName = async (gameId: string, newName: string) => {
  try {
    await prisma.game.update({
      where: { id: gameId },
      data: { name: newName }
    });
    return true;
  } catch (error) {
    console.error('Error updating game name:', error);
    throw error;
  }
};

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

export const getThreadMessages = async (threadId: string) => {
  try {
    const messages = await prisma.message.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' }
    });
    return messages;
  } catch (error) {
    console.error('Error fetching thread messages:', error);
    throw error;
  }
};

interface MessageParam {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const addThreadMessage = async (
  threadId: string,
  message: MessageParam
) => {
  try {
    await prisma.message.create({
      data: {
        threadId,
        content: message.content,
        role: message.role
      }
    });
  } catch (error) {
    console.error('Error adding thread message:', error);
    throw error;
  }
};
