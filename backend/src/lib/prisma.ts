import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

const isProduction = process.env.NODE_ENV === 'production';
const testUrl = (!isProduction && process.env.TEST_DATABASE_URL)
  ? process.env.TEST_DATABASE_URL
  : (process.env.NODE_ENV === 'test' && process.env.TEST_DATABASE_URL)
    ? process.env.TEST_DATABASE_URL
    : undefined;

if (testUrl && !isProduction) {
  process.env.DATABASE_URL = testUrl;
}

export const prisma = global.prismaGlobal || new PrismaClient(
  testUrl ? { datasources: { db: { url: testUrl } } } : undefined
);

if (process.env.NODE_ENV !== 'production') {
  global.prismaGlobal = prisma;
}
