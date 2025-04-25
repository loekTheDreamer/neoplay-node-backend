import Anthropic from '@anthropic-ai/sdk';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config/env';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface User {
  address: string;
}

console.log(prisma);

export function registerDbRoutes(fastify: FastifyInstance) {
  fastify.post('/doris-login', async (request, reply) => {
    console.log('hit');
    const { address } = request.body as User;
    console.log(address);
    try {
      const existing = await prisma.user.findUnique({
        where: { walletAddress: address }
      });
      console.log(existing);

      if (!existing) {
        await prisma.user.create({ data: { walletAddress: address } });
        reply.code(200).send({ message: 'User created successfully' });
      } else {
        reply.code(200).send({ message: 'User already exists' });
      }
    } catch (error) {
      reply.code(500).send({ error: 'Failed to create or check user' });
    }
  });

  fastify.post('/doris-find', async (request, reply) => {
    try {
      const users = await prisma.user.findMany();
      reply.code(200).send(users);
    } catch (error) {
      reply.code(500).send({ error: 'Failed to find users' });
    }
  });
}
