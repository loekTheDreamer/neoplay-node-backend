import Anthropic from '@anthropic-ai/sdk';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config/env';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';
import { verifyMessage } from 'ethers';

const prisma = new PrismaClient();

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
      let user = await prisma.user.findUnique({
        where: { walletAddress: address }
      });
      if (!user || !user.nonce) {
        return reply
          .code(400)
          .send({ error: 'No nonce found for this address' });
      }
      const message = `Sign this message to login: ${user.nonce}`;
      const recoveredAddress = verifyMessage(message, signature);
      console.log(
        'must be address:',
        '0x48f79AC485a1F263c9b835Da6ac70212054891Ec'
      );
      console.log('recoveredAddress:', recoveredAddress);

      if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
        return reply.code(401).send({ error: 'Invalid signature' });
      }

      // Clear nonce after successful login
      await prisma.user.update({
        where: { walletAddress: address },
        data: { nonce: null }
      });
      console.log('clear nonce');

      reply.code(200).send({ message: 'Authenticated', id: user.id });
    } catch (error) {
      reply.code(500).send({ error: 'Failed to authenticate user' });
    }
  });
  fastify.post('/game', async (request, reply) => {
    const { userId } = request.body as { userId: string };
    try {
      const game = await prisma.game.create({
        data: {
          name: 'Untitled Game',
          genre: 'Unknown',
          description: '',
          coverImageUrl: '',
          publisherId: userId,
          tags: []
          // status will default to DRAFT
        }
      });
      reply.code(201).send(game);
    } catch (error) {
      reply.code(500).send({ error: 'Failed to create game' });
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
}
