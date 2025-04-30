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
import { JwtPayload } from 'jsonwebtoken';
import { filesToCodeblocks } from '../../utils/codeBlocks';

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

interface SaveGameFilesToDB {
  gameId: string;
  gameFiles: GameFiles[];
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

    // Fetch the game with associated thread(s)
    const gameWithThread = await prisma.game.findUnique({
      where: { id: game.id },
      include: {
        threads: {
          select: {
            id: true,
            createdAt: true
          }
        }
      }
    });

    return gameWithThread;
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

// export const getThreadMessages = async (threadId: string) => {
//   try {
//     const messages = await prisma.message.findMany({
//       where: { threadId },
//       orderBy: { createdAt: 'asc' }
//     });

//     const files = await prisma.gameFile.findMany({
//       where: { gameId },
//       select: { filename: true, type: true, code: true }
//     });
//     const codeblocks = filesToCodeblocks(files);
//     console.log('codeblocks:', codeblocks);

//     return messages;
//   } catch (error) {
//     console.error('Error fetching thread messages:', error);
//     throw error;
//   }
// };

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

export const addThread = async (gameId: string, userId: string) => {
  try {
    // Find all threads for the game, including their messages
    const threads = await prisma.thread.findMany({
      where: { gameId },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'asc' },
          select: { id: true, role: true }
        }
      }
    });

    // If any thread has zero messages, do NOT create a new thread
    const threadWithNoMessages = threads.find(
      (thread) =>
        thread.messages.length === 0 || thread.messages[0].role === 'assistant'
    );
    if (threadWithNoMessages) {
      return { id: undefined, codeblocks: undefined };
    }

    // All threads have at least one message (or no threads exist), create a new thread
    const { id } = await prisma.thread.create({
      data: { gameId, userId }
    });

    const files = await prisma.gameFile.findMany({
      where: { gameId },
      select: { filename: true, type: true, code: true }
    });
    const codeBlocks = filesToCodeblocks(files);
    console.log('codeblocks:', codeBlocks);

    await addThreadMessage(id, { role: 'assistant', content: codeBlocks });

    return { id, codeBlocks };
    // // Check if any thread has messages
    // const threadWithMessages = threads.find(
    //   (thread) => thread.messages.length > 0
    // );
    // if (threadWithMessages) {
    //   // Return the id of the first thread with messages
    //   return threadWithMessages.id;
    // } else {
    //   // Threads exist but none have messages; do NOT create a new thread
    //   return undefined;
    // }
  } catch (error) {
    console.error('Error adding thread:', error);
    throw error;
  }
};

export const getThreadById = async (threadId: string) => {
  try {
    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        gameId: true,
        createdAt: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            content: true,
            role: true
          }
        }
      }
    });

    return thread;
  } catch (error) {
    console.error('Error fetching thread:', error);
    throw error;
  }
};

export const upsertGameFile = async ({
  gameId,
  gameFiles
}: SaveGameFilesToDB) => {
  try {
    const upsertedFiles = await Promise.all(
      gameFiles.map(
        async (file: { filename: string; type: string; code: string }) => {
          const { filename, type, code } = file;
          return prisma.gameFile.upsert({
            where: {
              gameId_filename: {
                gameId,
                filename
              }
            },
            update: { type, code },
            create: { filename, type, code, gameId }
          });
        }
      )
    );
    console.log('upsertedFiles:', upsertedFiles);
    return upsertedFiles;
  } catch (error) {
    console.error('Error upserting game files:', error);
    throw error;
  }
};

interface GetLatestGameParams {
  threadId: string;
  userId: string;
  reply: FastifyReply;
}
export const getLatestGame = async ({
  threadId,
  userId,
  reply
}: GetLatestGameParams) => {
  let latestGame;
  if (threadId) {
    // Find the latest game for the user that contains this threadId
    latestGame = await prisma.game.findFirst({
      where: {
        publisherId: userId,
        threads: {
          some: {
            id: threadId
          }
        }
      },
      orderBy: { createdAt: 'asc' },
      include: {
        threads: {
          where: { id: threadId },
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
    if (!latestGame) {
      console.log(`No game found for threadId: ${threadId}`);
      return reply.code(404).send({
        error: `No game found for threadId: ${threadId}. The ID provided might not be a thread ID.`
      });
    }
  } else {
    console.log('here');
    // Get the latest game for the user (with latest thread)
    latestGame = await prisma.game.findFirst({
      where: { publisherId: userId },
      orderBy: { createdAt: 'asc' },
      include: {
        threads: {
          orderBy: { createdAt: 'desc' },
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
  }

  console.log('latestGame:', latestGame);

  // Get all game names and published status, ordered by creation
  const gameList = await prisma.game.findMany({
    where: {
      publisherId: userId
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      createdAt: true,
      status: true,
      threads: {
        orderBy: { createdAt: 'desc' },
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

  return { latestGame, gameList };
};

interface UpdateLocalServerWithGameParams {
  threadId: string;
  user: JwtPayload;
  reply: FastifyReply;
}

export const updateLocalServerWithGame = async ({
  threadId,
  user,
  reply
}: UpdateLocalServerWithGameParams) => {
  console.log('updateLocalServerWithGame...');
  const { userId, address } = user;

  try {
    // 1. Find the thread and get the gameId
    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      select: { gameId: true }
    });
    if (!thread || !thread.gameId) {
      throw new Error('Thread not found or missing gameId');
    }
    const gameId = thread.gameId;

    // 2. Find all game files associated with the gameId
    const gameFiles = await prisma.gameFile.findMany({
      where: { gameId },
      select: {
        id: true,
        filename: true,
        code: true,
        type: true,
        createdAt: true,
        updatedAt: true
      }
    });
    // console.log('gameFiles:', gameFiles[0].filename);

    // Remove the folder public/currentGame/{address} and all its contents (Node 20+)
    const folderPath = path.join('public', 'currentGame', address);
    try {
      if (existsSync(folderPath)) {
        await fsp.rm(folderPath, { recursive: true, force: true });
        console.log(`Removed folder: ${folderPath}`);
      } else {
        console.log(`Folder does not exist: ${folderPath}`);
        // return;
      }
    } catch (err) {
      console.warn(`Could not remove folder ${folderPath}:`, err);
      return;
    }

    if (gameFiles.length === 0) {
      return;
    }

    await saveCurrentGame({ gameFiles, address, reply });
    for (const file of gameFiles) {
      console.log('file:', file.filename);
    }

    // You can return or process gameFiles as needed
    // return gameFiles;
  } catch (error) {
    console.error('Error in updateLocalServerWithGame:', error);
    throw error;
  }
};
