import assert from 'node:assert/strict';
import test from 'node:test';
import { ScribeSessionController } from './scribeSession';

test('requests a short-lived token, connects once, and disconnects on stop/dispose', async () => {
  const calls: string[] = [];
  const controller = new ScribeSessionController(
    async () => { calls.push('token'); return 'single-use'; },
    async ({ token }) => { calls.push(`connect:${token}`); },
    () => { calls.push('disconnect'); },
    () => undefined,
  );
  await Promise.all([controller.start(), controller.start()]);
  assert.deepEqual(calls.slice(0, 2), ['token', 'connect:single-use']);
  controller.stop();
  controller.dispose();
  assert.deepEqual(calls.filter((call) => call === 'disconnect').length, 2);
});

test('surfaces safe startup errors and permits a later retry', async () => {
  let attempts = 0;
  const errors: Array<string | null> = [];
  const controller = new ScribeSessionController(
    async () => { attempts += 1; if (attempts === 1) throw new Error('token service unavailable'); return 'token'; },
    async () => undefined,
    () => undefined,
    (message) => errors.push(message),
  );
  await controller.start();
  assert.match(errors.at(-1) ?? '', /token service unavailable/);
  await controller.start();
  assert.equal(errors.at(-1), null);
  assert.equal(attempts, 2);
  controller.dispose();
});

test('cancels a pending token request so it cannot connect after stop', async () => {
  let resolveToken!: (token: string) => void;
  let connected = false;
  const controller = new ScribeSessionController(
    () => new Promise<string>((resolve) => { resolveToken = resolve; }),
    async () => { connected = true; },
    () => undefined,
    () => undefined,
  );
  const starting = controller.start();
  controller.stop();
  resolveToken('cancelled-token');
  await starting;
  assert.equal(connected, false);
  controller.dispose();
});

test('unexpected socket disconnect clears controller state', async () => {
  let connections = 0;
  const controller = new ScribeSessionController(
    async () => 'token',
    async () => { connections += 1; },
    () => undefined,
    () => undefined,
  );
  await controller.start();
  controller.markDisconnected();
  await controller.start();
  assert.equal(connections, 2);
  controller.dispose();
});
