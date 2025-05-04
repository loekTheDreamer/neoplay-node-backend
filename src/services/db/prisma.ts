import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

console.log('DATABASE_URL from process.env:', process.env.DATABASE_URL);
console.log('NODE_ENV:', process.env.NODE_ENV);

// Force the URL to start with postgresql:// and add schema parameter
let databaseUrl = process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/^postgres:\/\//, 'postgresql://') : process.env.DATABASE_URL;
if (databaseUrl && !databaseUrl.includes('schema=')) {
  databaseUrl += (databaseUrl.includes('?') ? '&' : '?') + 'schema=public';
}
console.log('Modified DATABASE_URL for Prisma with schema:', databaseUrl);

let prisma: PrismaClient;

try {
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: ['query', 'info', 'warn', 'error'],
  });
  console.log('Prisma client initialized successfully');
  // Test the connection
  prisma.$connect()
    .then(() => console.log('Database connection test successful'))
    .catch((err) => console.error('Database connection test failed:', err));
} catch (error) {
  console.error('Failed to initialize Prisma client:', error);
  throw error;
}

export default prisma;
