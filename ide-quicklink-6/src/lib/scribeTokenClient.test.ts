import assert from 'node:assert/strict';
import test from 'node:test';
import { requestScribeToken } from './scribeTokenClient';

test('requests token from backend without credentials or cache and validates it', async () => {
  let requestUrl = '';
  let requestOptions: RequestInit | undefined;
  const token = await requestScribeToken({
    baseUrl: 'http://127.0.0.1:8000/',
    fetchImpl: async (input, init) => {
      requestUrl = String(input);
      requestOptions = init;
      return new Response(JSON.stringify({ token: 'single-use-token', expires_in_seconds: 900 }), { status: 200 });
    },
  });
  assert.equal(requestUrl, 'http://127.0.0.1:8000/api/v1/transcription/scribe-token');
  assert.equal(requestOptions?.method, 'GET');
  assert.equal(requestOptions?.credentials, 'omit');
  assert.equal(requestOptions?.cache, 'no-store');
  assert.equal(token, 'single-use-token');
});

test('reports network and backend errors without exposing provider credentials', async () => {
  await assert.rejects(
    requestScribeToken({ baseUrl: 'http://api.test', fetchImpl: async () => { throw new Error('secret'); } }),
    /Could not reach the live transcription service/,
  );
  await assert.rejects(
    requestScribeToken({
      baseUrl: 'http://api.test',
      fetchImpl: async () => new Response(JSON.stringify({ detail: { message: 'Live transcription is not configured.' } }), { status: 503 }),
    }),
    /not configured/,
  );
});
