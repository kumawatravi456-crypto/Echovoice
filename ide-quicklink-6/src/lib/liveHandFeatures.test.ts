import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeSlot0HandFeatures,
  LIVE_HAND_FEATURE_COLUMNS,
  type LiveLandmark,
} from './liveHandFeatures';

const sampleHand: LiveLandmark[] = Array.from({ length: 21 }, (_, index) => ({
  x: (index % 5) * 0.02,
  y: Math.floor(index / 5) * 0.04,
  z: index * 0.001,
}));

test('computes the fixed seven-feature vector deterministically over valid slot-0 frames', () => {
  const frames = Array.from({ length: 32 }, (_, index) => index < 8 ? sampleHand : null);
  const first = computeSlot0HandFeatures(frames);
  const second = computeSlot0HandFeatures(frames);

  assert.ok(first);
  assert.deepEqual(Object.keys(first), [...LIVE_HAND_FEATURE_COLUMNS]);
  assert.deepEqual(first, second);
  assert.ok(Object.values(first).every(Number.isFinite));
});

test('requires a complete 32-frame window and at least eight valid observations', () => {
  assert.equal(computeSlot0HandFeatures(Array(31).fill(sampleHand)), null);
  assert.equal(computeSlot0HandFeatures(Array.from({ length: 32 }, (_, index) => index < 7 ? sampleHand : null)), null);
});

test('rejects a non-finite landmark frame instead of treating it as a zero observation', () => {
  const invalidHand = sampleHand.map((point) => ({ ...point }));
  invalidHand[4].x = Number.NaN;
  const frames = Array.from({ length: 32 }, (_, index) => index < 8 ? sampleHand : null);
  frames[0] = invalidHand;

  assert.equal(computeSlot0HandFeatures(frames), null);
});
