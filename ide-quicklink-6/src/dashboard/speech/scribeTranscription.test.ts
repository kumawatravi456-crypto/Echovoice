import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachScribeTimestamps,
  correctSpeakerRole,
  mapProviderSpeakerToRole,
  normalizeBrowserTranscript,
  normalizeScribeTranscript,
  toConversationSpeaker,
} from './scribeTranscription';

test('normalizes finalized Scribe text and timestamps without inventing confidence', () => {
  const segment = normalizeScribeTranscript({
    id: 'segment-1',
    receivedAt: 123,
    text: '  Hello there. ',
    languageCode: 'eng',
    words: [
      { text: 'Hello', start: 1.2, end: 1.5, speaker_id: 'speaker_0' },
      { text: 'there.', start: 1.6, end: 2.0, speaker_id: 'speaker_0' },
    ],
  });
  assert.ok(segment);
  assert.equal(segment.id, 'segment-1');
  assert.equal(segment.text, 'Hello there.');
  assert.equal(segment.startTimeSeconds, 1.2);
  assert.equal(segment.endTimeSeconds, 2);
  assert.equal(segment.providerSpeakerLabel, 'speaker_0');
  assert.equal(segment.speakerRole, 'UNKNOWN');
  assert.equal(segment.asrConfidence, null);
  assert.equal(segment.speakerConfidence, null);
  assert.equal(segment.languageCode, 'eng');
  assert.equal(segment.isFinal, true);
});

test('maps only explicitly corrected provider speakers and keeps unknown attribution', () => {
  assert.equal(mapProviderSpeakerToRole('speaker_0'), 'UNKNOWN');
  assert.equal(mapProviderSpeakerToRole('speaker_0', { speaker_0: 'PARTNER' }), 'PARTNER');
  assert.equal(mapProviderSpeakerToRole(null, { speaker_0: 'PARTNER' }), 'UNKNOWN');
  assert.equal(toConversationSpeaker('UNKNOWN'), 'unknown');
  const first = normalizeScribeTranscript({ id: 'one', text: 'Hello', words: [{ speaker_id: 'speaker_0' }] })!;
  const second = normalizeScribeTranscript({ id: 'two', text: 'Yes', words: [{ speaker_id: 'speaker_0' }] })!;
  const corrected = correctSpeakerRole([first, second], 'one', 'PARTNER');
  assert.deepEqual(corrected.map((segment) => segment.speakerRole), ['PARTNER', 'PARTNER']);
});

test('attaches timestamp callback data to the matching committed transcript', () => {
  const committed = normalizeScribeTranscript({ id: 'stable-id', text: 'Need water', receivedAt: 456 })!;
  const updated = attachScribeTimestamps([committed], {
    text: 'Need water',
    languageCode: 'hin',
    words: [{ start: 4, end: 5, speaker_id: 'speaker_1' }],
  });
  assert.equal(updated[0].id, 'stable-id');
  assert.equal(updated[0].startTimeSeconds, 4);
  assert.equal(updated[0].endTimeSeconds, 5);
  assert.equal(updated[0].languageCode, 'hin');
  assert.equal(updated[0].speakerRole, 'UNKNOWN');
});

test('browser fallback final transcript is normalized with unknown speaker and no confidence', () => {
  assert.equal(normalizeBrowserTranscript('  '), null);
  const segment = normalizeBrowserTranscript(' I need help ', { id: 'browser-1', receivedAt: 10 });
  assert.ok(segment);
  assert.equal(segment.text, 'I need help');
  assert.equal(segment.provider, 'browser');
  assert.equal(segment.speakerRole, 'UNKNOWN');
  assert.equal(segment.startTimeSeconds, null);
  assert.equal(segment.asrConfidence, null);
  assert.equal(segment.speakerConfidence, null);
});
