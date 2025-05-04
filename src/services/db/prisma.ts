import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

console.log('DATABASE_URL from process.env:', process.env.DATABASE_URL);
console.log('NODE_ENV:', process.env.NODE_ENV);

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

export default prisma;
