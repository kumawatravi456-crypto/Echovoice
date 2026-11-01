import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConversationGenerationQueue,
  conversationGenerationReducer,
  initialConversationGenerationState,
} from './useConversationGeneration';
import type { ConversationGenerateRequest, ConversationGenerateResponse } from '../../lib/conversationGenerationClient';

const response = (suggested_response: string): ConversationGenerateResponse => ({
  suggested_response,
  gesture_context_used: false,
  warnings: [],
});

const request = (latest_finalized_transcript: string): ConversationGenerateRequest => ({
  latest_finalized_transcript,
  latest_speaker: 'partner',
  history: [],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test('duplicate finalized transcript submissions create only one provider request', async () => {
  const finished = deferred<void>();
  let calls = 0;
  const queue = new ConversationGenerationQueue(
    async () => {
      calls += 1;
      return response('A draft');
    },
    {
      onGenerating: () => undefined,
      onSuccess: () => finished.resolve(),
      onFailure: (error) => { throw error; },
    },
  );

  assert.equal(queue.submit(request('Hello there')), true);
  assert.equal(queue.submit(request(' hello   there ')), false);
  await finished.promise;
  assert.equal(calls, 1);
  queue.dispose();
});

test('serializes requests and applies only the newest draft when speech arrives during generation', async () => {
  const firstResponse = deferred<ConversationGenerateResponse>();
  const newestFinished = deferred<void>();
  const calls: string[] = [];
  const appliedDrafts: string[] = [];
  const queue = new ConversationGenerationQueue(
    (item) => {
      calls.push(item.latest_finalized_transcript);
      return item.latest_finalized_transcript === 'first'
        ? firstResponse.promise
        : Promise.resolve(response('Newest draft'));
    },
    {
      onGenerating: () => undefined,
      onSuccess: (item) => {
        appliedDrafts.push(item.latest_finalized_transcript);
        newestFinished.resolve();
      },
      onFailure: (error) => { throw error; },
    },
  );

  queue.submit(request('first'));
  queue.submit(request('second'));
  queue.submit(request('third'));
  assert.deepEqual(calls, ['first']);
  firstResponse.resolve(response('Old draft'));
  await newestFinished.promise;

  assert.deepEqual(calls, ['first', 'third']);
  assert.deepEqual(appliedDrafts, ['third']);
  queue.dispose();
});

test('retries a failed request without submitting a new transcript entry', async () => {
  const failedOnce = deferred<void>();
  const finishedRetry = deferred<void>();
  let calls = 0;
  const queue = new ConversationGenerationQueue(
    async () => {
      calls += 1;
      if (calls === 1) throw new Error('temporary provider failure');
      return response('Retried draft');
    },
    {
      onGenerating: () => undefined,
      onSuccess: () => finishedRetry.resolve(),
      onFailure: () => failedOnce.resolve(),
    },
  );

  queue.submit(request('Keep this transcript'));
  await failedOnce.promise;
  assert.equal(queue.retryLastFailure(), true);
  await finishedRetry.promise;
  assert.equal(calls, 2);
  queue.dispose();
});

test('editing an AI draft does not confirm it; confirmation only marks text for review/speech', () => {
  const ready = conversationGenerationReducer(initialConversationGenerationState, {
    type: 'draft-ready',
    transcript: 'Hello',
    response: response('How can I help?'),
  });
  const edited = conversationGenerationReducer(ready, {
    type: 'edit-draft',
    text: 'Could you help me?'
  });
  assert.equal(edited.draft?.suggestedResponse, 'Could you help me?');
  assert.equal(edited.confirmedResponse, null);

  const confirmed = conversationGenerationReducer(edited, {
    type: 'confirm-draft',
    text: edited.draft!.suggestedResponse,
  });
  assert.equal(confirmed.confirmedResponse, 'Could you help me?');
  assert.equal(confirmed.draft?.suggestedResponse, 'Could you help me?');
  // Draft confirmation is a state update; this reducer has no audio/playback side effect.
});
