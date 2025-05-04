import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';
import { verifyMessage } from 'ethers';
import { signJwt, signRefreshToken, verifyRefreshToken } from '../../utils/jwt.js';
import { authMiddleware } from '../../middleware/auth.js';
import prisma from './prisma.js'; // adjust the path as needed
import { createGame } from '../game/gameHelpers.js';

interface User {
  address: string;
}

export function registerDbRoutes(fastify: FastifyInstance) {
  fastify.post('/auth/nonce', async (request, reply) => {
    console.log('/auth/nonce');
    const { address } = request.body as { address: string };
    const nonce = uuidv4();
    let user = await prisma.user.findUnique({
      where: { walletAddress: address }
    });
    if (user) {
      console.log('User found, updating nonce');
      await prisma.user.update({
        where: { walletAddress: address },
        data: { nonce }
      });
    } else {
      console.log('User not found, creating new user');
      await prisma.user.create({ data: { walletAddress: address, nonce } });
    }
    reply.send({ nonce, message: `Sign this message to login: ${nonce}` });
  });

  fastify.post('/auth/login', async (request, reply) => {
    console.log('/auth/login');
    const { address, signature } = request.body as {
      address: string;
      signature: string;
    };
    try {
      const user = await prisma.user.findUnique({
        where: { walletAddress: address }
      });
      if (!user || !user.nonce) {
        return reply
          .code(400)
          .send({ error: 'No nonce found for this address' });
      }
      const message = `Sign this message to login: ${user.nonce}`;
      const recoveredAddress = verifyMessage(message, signature);

      if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
        return reply.code(401).send({ error: 'Invalid signature' });
      }

      // Clear nonce after successful login
      await prisma.user.update({
        where: { walletAddress: address },
        data: { nonce: null }
      });
      // Issue JWTs
      const token = signJwt({ id: user.id, address });

      const games = await prisma.game.findMany({
        where: {
          publisherId: user.id
        }
      });
      console.log('games:', games);
      console.log('user:', user.id);
      if (games.length === 0) {
        await createGame(user.id);
      }
      // const refreshToken = signRefreshToken({ id: user.id, address });

      // // Set refresh token as httpOnly cookie
      // reply.setCookie('refreshToken', refreshToken, {
      //   httpOnly: true,
      //   path: '/',
      //   sameSite: 'lax',
      //   secure: process.env.NODE_ENV === 'production',
      //   maxAge: 30 * 24 * 60 * 60 // 30 days
      // });

      reply
        .code(200)
        .send({ message: 'Authenticated', token, address: recoveredAddress });
    } catch (error) {
      reply.code(500).send({ error: 'Failed to authenticate user' });
    }
  });

  // fastify.post('/doris-find', async (request, reply) => {
  //   try {
  //     const users = await prisma.user.findMany();
  //     reply.code(200).send(users);
  //   } catch (error) {
  //     reply.code(500).send({ error: 'Failed to find users' });
  //   }
  // });

  // Endpoint to refresh access token
  fastify.post('/auth/refresh', async (request, reply) => {
    const { refreshToken } = request.cookies || {};
    if (!refreshToken) {
      return reply.code(401).send({ error: 'No refresh token provided' });
    }
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      return reply
        .code(401)
        .send({ error: 'Invalid or expired refresh token' });
    }
    const newAccessToken = signJwt({
      id: payload.id,
      address: payload.address
    });
    reply.code(200).send({ token: newAccessToken });
  });
}
