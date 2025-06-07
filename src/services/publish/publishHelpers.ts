import { FastifyReply } from 'fastify';
import { config } from '../../config/env.js';
import * as path from 'path';
import { promises as fsp, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../db/prisma.js';

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

interface PublishGameRequest {
  name: string;
  genre: string;
  description: string;
  tags: string;
  coverImage: string;
  id: string;
  address: string;
  reply: FastifyReply;
}

const contentType = (filename: string) => {
  console.log('filename content:', filename);
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

export async function publish({
  address,
  name,
  genre,
  description,
  tags,
  coverImage,
  id,
  reply
}: PublishGameRequest): Promise<any> {
  console.log('lets gooooooo!!!!!!');
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
    // Recursively list all files under srcDir
    async function walkDir(dir: string, dirPrefix = ''): Promise<string[]> {
      const dirents = await fsp.readdir(dir, { withFileTypes: true });
      const files = await Promise.all(
        dirents.map(async (dirent) => {
          const res = path.join(dir, dirent.name);
          const relPath = path.join(dirPrefix, dirent.name);
          if (dirent.isDirectory()) {
            return walkDir(res, relPath);
          } else {
            return relPath;
          }
        })
      );
      return Array.prototype.concat(...files);
    }

    let files: string[] = [];
    try {
      files = await walkDir(srcDir);
      console.log('files:', files);
    } catch (err) {
      reply.code(404).send({ error: 'No files found for this game' });
      return;
    }
    if (!files || files.length === 0) {
      reply.code(404).send({ error: 'No files found for this game' });
      return;
    }
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
            Body: fileContent,
            ContentType: contentType(file)
          })
        );
        console.log(`Uploaded ${filePath} to ${destKey}`);
      } catch (err) {
        console.log('Upload error:', err);
        throw err;
      }
    });
    await Promise.all(copyPromises);

    // 2b. Upload cover image if provided
    if (
      coverImage &&
      typeof coverImage === 'string' &&
      coverImage.startsWith('data:image')
    ) {
      const matches = coverImage.match(
        /^data:(image\/(png|jpeg));base64,(.+)$/
      );
      if (matches) {
        const imageType = matches[2];
        const imageBuffer = Buffer.from(matches[3], 'base64');
        const coverImageKey = `${destPrefix}img/coverImage.${
          imageType === 'jpeg' ? 'jpg' : imageType
        }`;
        try {
          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: coverImageKey,
              Body: imageBuffer,
              ContentType: `image/${imageType}`
            })
          );
          console.log(`Uploaded cover image to ${coverImageKey}`);
        } catch (err) {
          console.error('Failed to upload cover image:', err);
        }
      }
    }

    await prisma.game.update({
      where: { id: gameId },
      data: {
        name,
        genre,
        description,
        tags: Array.isArray(tags)
          ? tags
          : typeof tags === 'string'
          ? tags
              .split(',')
              .map((t: string) => t.trim())
              .filter(Boolean)
          : [],
        status: 'PUBLISHED',
        publishedAt: new Date()
      }
    });

    return true;
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

export const getPublishedGames = async (userId?: string) => {
  try {
    const publishedGames = await prisma.game.findMany({
      where: {
        status: 'PUBLISHED'
      },
      orderBy: {
        publishedAt: 'desc'
      },
      include: {
        publisher: {
          select: {
            walletAddress: true
          }
        },
        _count: {
          select: { likedBy: true }
        }
      }
    });
    if (!userId) {
      // If no userId, return games without likedByMe or playedByMe
      return publishedGames;
    }
    const gameIds = publishedGames.map((game) => game.id);
    // Get all likes for this user for these games
    const userLikes = await prisma.like.findMany({
      where: {
        userId,
        gameId: { in: gameIds }
      },
      select: { gameId: true }
    });
    const likedGameIds = new Set(userLikes.map((like) => like.gameId));

    // Get all plays for this user for these games
    const userPlays = await prisma.play.findMany({
      where: {
        userId,
        gameId: { in: gameIds }
      },
      select: { gameId: true }
    });
    const playedGameIds = new Set(userPlays.map((play) => play.gameId));

    // Add likedByMe and playedByMe property
    return publishedGames.map((game) => ({
      ...game,
      likedByMe: likedGameIds.has(game.id),
      playedByMe: playedGameIds.has(game.id)
    }));
  } catch (error) {
    console.error('Error getting published games:', error);
    throw error;
  }
};

export async function likeGame(userId: string, gameId: string): Promise<void> {
  // Will throw if already exists due to @@unique([userId, gameId])
  await prisma.like.create({
    data: {
      userId,
      gameId
    }
  });
}

export async function playGame(gameId: string): Promise<void> {
  // Increment the play count for the game by 1
  await prisma.game.update({
    where: { id: gameId },
    data: { plays: { increment: 1 } }
  });
}

export async function addPlayRecord(
  userId: string,
  gameId: string
): Promise<void> {
  // Create a Play record if one does not already exist for this user/game
  await prisma.play.upsert({
    where: {
      userId_gameId: {
        userId,
        gameId
      }
    },
    update: {}, // do nothing if exists
    create: { userId, gameId }
  });
}
