import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildConversationGenerateRequest,
  generateConversationResponse,
} from './conversationGenerationClient';

test('builds a backend-schema request for a non-empty finalized transcript and fresh gesture', () => {
  const request = buildConversationGenerateRequest(
    '  I need water.  ',
    'user',
    [{ speaker: 'partner', text: 'What would help?' }],
    { label: 'WATER', timestampMs: 9_000 },
    10_000,
  );

  assert.deepEqual(request, {
    latest_finalized_transcript: 'I need water.',
    latest_speaker: 'user',
    history: [{ speaker: 'partner', text: 'What would help?' }],
    gesture_label: 'WATER',
    gesture_timestamp: new Date(9_000).toISOString(),
  });
  assert.equal('gesture_confidence' in (request ?? {}), false);
  assert.equal('camera_frame' in (request ?? {}), false);
});

test('does not generate for an empty transcript or attach a stale gesture', () => {
  assert.equal(buildConversationGenerateRequest(' \n ', 'partner', []), null);
  const request = buildConversationGenerateRequest(
    'Hello',
    'partner',
    [],
    { label: 'YES', timestampMs: 1_000 },
    7_000,
  );
  assert.deepEqual(request, {
    latest_finalized_transcript: 'Hello',
    latest_speaker: 'partner',
    history: [],
  });
});

test('sends JSON to the conversation endpoint and returns a validated draft response', async () => {
  const request = buildConversationGenerateRequest('Hello', 'partner', [])!;
  let fetchUrl = '';
  let fetchInit: RequestInit | undefined;
  const result = await generateConversationResponse(request, {
    baseUrl: 'http://127.0.0.1:8000/',
    fetchImpl: async (input, init) => {
      fetchUrl = String(input);
      fetchInit = init;
      return new Response(JSON.stringify({
        suggested_response: 'Hi, how can I help?',
        gesture_context_used: false,
        warnings: ['No hand gesture was supplied.'],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  assert.equal(fetchUrl, 'http://127.0.0.1:8000/api/v1/conversation/generate');
  assert.equal(fetchInit?.method, 'POST');
  assert.equal(fetchInit?.credentials, 'omit');
  assert.deepEqual(JSON.parse(String(fetchInit?.body)), request);
  assert.deepEqual(result, {
    suggested_response: 'Hi, how can I help?',
    gesture_context_used: false,
    warnings: ['No hand gesture was supplied.'],
  });
});

test('reports backend and network failures without swallowing them as drafts', async () => {
  const request = buildConversationGenerateRequest('Hello', 'partner', [])!;
  await assert.rejects(
    generateConversationResponse(request, {
      baseUrl: 'http://api.test',
      fetchImpl: async () => new Response(JSON.stringify({
        detail: { code: 'conversation_unavailable', message: 'Conversation service is unavailable.' },
      }), { status: 503, headers: { 'Content-Type': 'application/json' } }),
    }),
    /Conversation service is unavailable\./,
  );
  await assert.rejects(
    generateConversationResponse(request, {
      baseUrl: 'http://api.test',
      fetchImpl: async () => { throw new TypeError('network down'); },
    }),
    /Could not reach the conversation service/,
  );
});
