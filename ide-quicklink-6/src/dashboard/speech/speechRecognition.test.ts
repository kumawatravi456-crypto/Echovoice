import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SpeechRecognitionController,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
} from './speechRecognition';

class FakeRecognition implements SpeechRecognitionLike {
  lang = '';
  continuous = false;
  interimResults = false;
  onstart: (() => void) | null = null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  startCalls = 0;
  stopCalls = 0;

  start(): void {
    this.startCalls += 1;
    this.onstart?.();
  }

  stop(): void {
    this.stopCalls += 1;
  }
}

function result(transcript: string, isFinal: boolean) {
  return { 0: { transcript }, isFinal };
}

test('keeps interim speech separate and appends the same finalized result only once', () => {
  const recognition = new FakeRecognition();
  const finals: string[] = [];
  const snapshots: Array<{ status: string; interimTranscript: string; error: string }> = [];
  const controller = new SpeechRecognitionController(() => recognition, {
    onChange: (snapshot) => snapshots.push(snapshot),
    onFinalTranscript: (text) => finals.push(text),
  }, 'en-US');

  controller.start();
  recognition.onresult?.({ results: [result('I need', false)], resultIndex: 0 });
  assert.equal(controller.getSnapshot().interimTranscript, 'I need');
  assert.deepEqual(finals, []);

  const finalEvent = { results: [result('I need water', true)], resultIndex: 0 };
  recognition.onresult?.(finalEvent);
  recognition.onresult?.(finalEvent);
  assert.deepEqual(finals, ['I need water']);
  assert.equal(controller.getSnapshot().interimTranscript, '');
  assert.equal(controller.getSnapshot().status, 'listening');
  assert.ok(snapshots.some((snapshot) => snapshot.status === 'listening'));

  controller.dispose();
});

test('handles no-speech and microphone denial without restarting a failed session', () => {
  const recognition = new FakeRecognition();
  const controller = new SpeechRecognitionController(() => recognition, {
    onChange: () => undefined,
    onFinalTranscript: () => undefined,
  }, 'en-US');

  controller.start();
  recognition.onerror?.({ error: 'no-speech' });
  assert.equal(controller.getSnapshot().status, 'listening');
  assert.match(controller.getSnapshot().error, /No speech detected/);

  recognition.onerror?.({ error: 'not-allowed' });
  assert.equal(controller.getSnapshot().status, 'error');
  assert.match(controller.getSnapshot().error, /permission was denied/);
  const startCallsAfterDenial = recognition.startCalls;
  recognition.onend?.();
  assert.equal(recognition.startCalls, startCallsAfterDenial);

  controller.dispose();
});

test('stopping cancels pending restart and dispose removes recognition handlers', async () => {
  const recognition = new FakeRecognition();
  const controller = new SpeechRecognitionController(() => recognition, {
    onChange: () => undefined,
    onFinalTranscript: () => undefined,
  }, 'en-US');

  controller.start();
  recognition.onend?.(); // Request a bounded continuous-listening restart.
  controller.stop();
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(recognition.startCalls, 1);
  assert.equal(controller.getSnapshot().status, 'stopping');

  recognition.onend?.();
  assert.equal(controller.getSnapshot().status, 'idle');
  controller.start();
  controller.dispose();
  assert.equal(recognition.onstart, null);
  assert.equal(recognition.onresult, null);
  assert.equal(recognition.onerror, null);
  assert.equal(recognition.onend, null);
});

test('reports unsupported browsers without attempting recognition', () => {
  const controller = new SpeechRecognitionController(null, {
    onChange: () => undefined,
    onFinalTranscript: () => undefined,
  }, 'en-US');

  controller.start();
  assert.equal(controller.getSnapshot().status, 'unsupported');
  controller.dispose();
});
