export type ConversationSpeaker = 'user' | 'partner' | 'unknown';
export type ConversationGestureLabel = 'YES' | 'NO' | 'HELP' | 'WATER' | 'STOP';

export interface ConversationHistoryTurn {
  speaker: ConversationSpeaker;
  text: string;
}

export interface ConversationGestureContext {
  label: ConversationGestureLabel;
  timestampMs: number;
}

export interface ConversationGenerateRequest {
  latest_finalized_transcript: string;
  latest_speaker: ConversationSpeaker;
  history?: ConversationHistoryTurn[];
  gesture_label?: ConversationGestureLabel;
  gesture_timestamp?: string;
}

export interface ConversationGenerateResponse {
  suggested_response: string;
  gesture_context_used: boolean;
  warnings: string[];
}

export const MAX_GESTURE_AGE_MS = 5000;
const MAX_TRANSCRIPT_LENGTH = 1000;
const MAX_HISTORY_TURNS = 20;
const gestureLabels = new Set<ConversationGestureLabel>(['YES', 'NO', 'HELP', 'WATER', 'STOP']);

export function buildConversationGenerateRequest(
  transcript: string,
  speaker: ConversationSpeaker,
  history: readonly ConversationHistoryTurn[],
  gesture?: ConversationGestureContext | null,
  nowMs = Date.now(),
): ConversationGenerateRequest | null {
  const normalizedTranscript = transcript.trim();
  if (!normalizedTranscript) return null;
  if (normalizedTranscript.length > MAX_TRANSCRIPT_LENGTH) {
    throw new Error('This finalized transcript is too long to request a response.');
  }

  const request: ConversationGenerateRequest = {
    latest_finalized_transcript: normalizedTranscript,
    latest_speaker: speaker,
    history: history
      .filter((turn) => turn.text.trim().length > 0)
      .slice(-MAX_HISTORY_TURNS)
      .map((turn) => ({ speaker: turn.speaker, text: turn.text.trim().slice(0, MAX_TRANSCRIPT_LENGTH) })),
  };

  if (
    gesture &&
    gestureLabels.has(gesture.label) &&
    Number.isFinite(gesture.timestampMs) &&
    Number.isFinite(nowMs) &&
    nowMs >= gesture.timestampMs &&
    nowMs - gesture.timestampMs <= MAX_GESTURE_AGE_MS
  ) {
    request.gesture_label = gesture.label;
    request.gesture_timestamp = new Date(gesture.timestampMs).toISOString();
  }

  return request;
}

function getApiBaseUrl(): string {
  const environment = (import.meta as unknown as { env?: { VITE_ECHO_API_BASE_URL?: string } }).env;
  const configuredBaseUrl = environment?.VITE_ECHO_API_BASE_URL?.trim();
  if (!configuredBaseUrl) {
    throw new Error('Conversation generation is not configured. Set VITE_ECHO_API_BASE_URL and restart the frontend.');
  }
  return configuredBaseUrl.replace(/\/+$/, '');
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'detail' in body) {
      const detail = (body as { detail?: unknown }).detail;
      if (typeof detail === 'string') return detail;
      if (typeof detail === 'object' && detail !== null && 'message' in detail) {
        const message = (detail as { message?: unknown }).message;
        if (typeof message === 'string') return message;
      }
    }
  } catch {
    // Fall through to a status-only message if the server did not return JSON.
  }
  return `Conversation response generation failed (HTTP ${response.status}).`;
}

function isConversationGenerateResponse(value: unknown): value is ConversationGenerateResponse {
  if (typeof value !== 'object' || value === null) return false;
  const response = value as Partial<ConversationGenerateResponse>;
  return (
    typeof response.suggested_response === 'string' &&
    response.suggested_response.trim().length > 0 &&
    typeof response.gesture_context_used === 'boolean' &&
    Array.isArray(response.warnings) &&
    response.warnings.every((warning) => typeof warning === 'string')
  );
}

export async function generateConversationResponse(
  request: ConversationGenerateRequest,
  options: { baseUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<ConversationGenerateResponse> {
  const baseUrl = options.baseUrl?.replace(/\/+$/, '') ?? getApiBaseUrl();
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`${baseUrl}/api/v1/conversation/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify(request),
    });
  } catch {
    throw new Error('Could not reach the conversation service. Check the API URL and connection.');
  }

  if (!response.ok) throw new Error(await readApiError(response));

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error('The conversation service returned an unreadable response.');
  }
  if (!isConversationGenerateResponse(result)) {
    throw new Error('The conversation service returned an unexpected response.');
  }
  return result;
}
