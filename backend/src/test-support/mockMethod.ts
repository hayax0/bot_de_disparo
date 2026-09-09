import type { TestContext } from 'node:test';

// Prisma expõe métodos por Proxy; MockTracker.method não encontra seus descriptors.
export function mockMethod(t: TestContext, target: any, name: string, implementation: (...args: any[]) => any) {
  const previous = target[name];
  const mock = t.mock.fn(implementation);
  target[name] = mock;
  t.after(() => { target[name] = previous; });
  return mock;
}
