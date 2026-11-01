import type { WordTimestamp } from '@elevenlabs/react';

export type SpeakerRole = 'PARTNER' | 'ECHO_USER' | 'UNKNOWN';
export type TranscriptionProvider = 'scribe' | 'browser';

export interface NormalizedTranscriptSegment {
  id: string;
  text: string;
  startTimeSeconds: number | null;
  endTimeSeconds: number | null;
  providerSpeakerLabel: string | null;
  speakerRole: SpeakerRole;
  asrConfidence: number | null;
  speakerConfidence: number | null;
  languageCode: string | null;
  isFinal: boolean;
  provider: TranscriptionProvider;
  receivedAt: number;
}

export type SpeakerRoleMappings = Readonly<Record<string, SpeakerRole>>;

export function mapProviderSpeakerToRole(
  providerSpeakerLabel: string | null | undefined,
  mappings: SpeakerRoleMappings = {},
): SpeakerRole {
  if (!providerSpeakerLabel) return 'UNKNOWN';
  return mappings[providerSpeakerLabel] ?? 'UNKNOWN';
}

export function normalizeScribeTranscript(input: {
  text: string;
  words?: readonly WordTimestamp[];
  languageCode?: string | null;
  speakerMappings?: SpeakerRoleMappings;
  id?: string;
  receivedAt?: number;
}): NormalizedTranscriptSegment | null {
  const text = input.text.trim();
  if (!text) return null;
  const labels = [...new Set((input.words ?? [])
    .map((word) => word.speaker_id)
    .filter((label): label is string => typeof label === 'string' && label.trim().length > 0))];
  const providerSpeakerLabel = labels.length === 1 ? labels[0] : null;
  const starts = (input.words ?? []).map((word) => word.start).filter((time): time is number => Number.isFinite(time));
  const ends = (input.words ?? []).map((word) => word.end).filter((time): time is number => Number.isFinite(time));

  return {
    id: input.id ?? crypto.randomUUID(),
    text,
    startTimeSeconds: starts.length ? Math.min(...starts) : null,
    endTimeSeconds: ends.length ? Math.max(...ends) : null,
    providerSpeakerLabel,
    speakerRole: mapProviderSpeakerToRole(providerSpeakerLabel, input.speakerMappings),
    // Scribe Realtime does not supply ASR or diarization confidence in its public event schema.
    asrConfidence: null,
    speakerConfidence: null,
    languageCode: input.languageCode ?? null,
    isFinal: true,
    provider: 'scribe',
    receivedAt: input.receivedAt ?? Date.now(),
  };
}

export function normalizeBrowserTranscript(
  text: string,
  options: { id?: string; receivedAt?: number } = {},
): NormalizedTranscriptSegment | null {
  const normalized = text.trim();
  if (!normalized) return null;
  return {
    id: options.id ?? crypto.randomUUID(),
    text: normalized,
    startTimeSeconds: null,
    endTimeSeconds: null,
    providerSpeakerLabel: null,
    speakerRole: 'UNKNOWN',
    asrConfidence: null,
    speakerConfidence: null,
    languageCode: null,
    isFinal: true,
    provider: 'browser',
    receivedAt: options.receivedAt ?? Date.now(),
  };
}

export function attachScribeTimestamps(
  segments: readonly NormalizedTranscriptSegment[],
  input: { text: string; words?: readonly WordTimestamp[]; languageCode?: string | null },
  mappings: SpeakerRoleMappings = {},
): NormalizedTranscriptSegment[] {
  const matchIndex = [...segments].reverse().findIndex((segment) =>
    segment.provider === 'scribe' && segment.text === input.text.trim() && segment.startTimeSeconds === null,
  );
  if (matchIndex < 0) return [...segments];
  const index = segments.length - 1 - matchIndex;
  const replacement = normalizeScribeTranscript({
    ...input,
    speakerMappings: mappings,
    id: segments[index].id,
    receivedAt: segments[index].receivedAt,
  });
  if (!replacement) return [...segments];
  const next = [...segments];
  next[index] = { ...segments[index], ...replacement };
  return next;
}

export function correctSpeakerRole(
  segments: readonly NormalizedTranscriptSegment[],
  segmentId: string,
  role: SpeakerRole,
): NormalizedTranscriptSegment[] {
  const selected = segments.find((segment) => segment.id === segmentId);
  if (!selected) return [...segments];
  return segments.map((segment) =>
    segment.id === segmentId || (
      selected.providerSpeakerLabel !== null &&
      segment.providerSpeakerLabel === selected.providerSpeakerLabel
    )
      ? { ...segment, speakerRole: role }
      : segment,
  );
}

export function toConversationSpeaker(role: SpeakerRole): 'partner' | 'user' | 'unknown' {
  if (role === 'PARTNER') return 'partner';
  if (role === 'ECHO_USER') return 'user';
  return 'unknown';
}
