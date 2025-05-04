import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

console.log('DATABASE_URL from process.env:', process.env.DATABASE_URL);
console.log('NODE_ENV:', process.env.NODE_ENV);

// Force the URL to start with postgresql://
const databaseUrl = process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/^postgres:\/\/$/, 'postgresql://') : process.env.DATABASE_URL;
console.log('Modified DATABASE_URL for Prisma:', databaseUrl);

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

export default prisma;
