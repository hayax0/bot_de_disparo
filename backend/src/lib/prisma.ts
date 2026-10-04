import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

/**
 * Resolve a URL de conexão do Prisma de forma estrita:
 * - Execução explícita de testes (NODE_ENV === 'test'): utiliza TEST_DATABASE_URL.
 * - Desenvolvimento e produção (NODE_ENV !== 'test'): utiliza exclusivamente DATABASE_URL,
 *   mesmo que TEST_DATABASE_URL esteja configurada no ambiente.
 */
export function resolvePrismaDatabaseUrl(): string | undefined {
  const isExplicitTest = process.env.NODE_ENV === 'test';
  if (isExplicitTest && process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }
  return process.env.DATABASE_URL;
}

const isExplicitTest = process.env.NODE_ENV === 'test';
const testUrl = isExplicitTest && process.env.TEST_DATABASE_URL
  ? process.env.TEST_DATABASE_URL
  : undefined;

if (isExplicitTest && testUrl) {
  process.env.DATABASE_URL = testUrl;
}

export const prisma = global.prismaGlobal || new PrismaClient(
  testUrl ? { datasources: { db: { url: testUrl } } } : undefined
);

if (process.env.NODE_ENV !== 'production') {
  global.prismaGlobal = prisma;
}
