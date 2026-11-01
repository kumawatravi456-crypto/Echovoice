import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  buildConversationGenerateRequest,
  generateConversationResponse,
  type ConversationGenerateRequest,
  type ConversationGenerateResponse,
  type ConversationGestureContext,
  type ConversationHistoryTurn,
  type ConversationSpeaker,
} from '../../lib/conversationGenerationClient';

export type ConversationGenerationStatus = 'idle' | 'generating' | 'draft-ready' | 'error';

export interface ConversationResponseDraft {
  sourceTranscript: string;
  suggestedResponse: string;
  gestureContextUsed: boolean;
  warnings: string[];
}

export interface ConversationGenerationState {
  status: ConversationGenerationStatus;
  draft: ConversationResponseDraft | null;
  confirmedResponse: string | null;
  error: string | null;
}

type ConversationGenerationAction =
  | { type: 'generating' }
  | { type: 'draft-ready'; transcript: string; response: ConversationGenerateResponse }
  | { type: 'failed'; message: string }
  | { type: 'edit-draft'; text: string }
  | { type: 'confirm-draft'; text: string };

export const initialConversationGenerationState: ConversationGenerationState = {
  status: 'idle',
  draft: null,
  confirmedResponse: null,
  error: null,
};

export function conversationGenerationReducer(
  state: ConversationGenerationState,
  action: ConversationGenerationAction,
): ConversationGenerationState {
  switch (action.type) {
    case 'generating':
      return { ...state, status: 'generating', error: null };
    case 'draft-ready':
      return {
        status: 'draft-ready',
        draft: {
          sourceTranscript: action.transcript,
          suggestedResponse: action.response.suggested_response,
          gestureContextUsed: action.response.gesture_context_used,
          warnings: action.response.warnings,
        },
        confirmedResponse: null,
        error: null,
      };
    case 'failed':
      return { ...state, status: 'error', error: action.message };
    case 'edit-draft':
      return state.draft
        ? {
            ...state,
            draft: { ...state.draft, suggestedResponse: action.text },
            confirmedResponse: null,
          }
        : state;
    case 'confirm-draft':
      return state.draft && action.text.trim()
        ? { ...state, confirmedResponse: action.text.trim() }
        : state;
  }
}

export function getConfirmableDraftText(draft: ConversationResponseDraft | null): string | null {
  const text = draft?.suggestedResponse.trim();
  return text || null;
}

type GenerationCallbacks = {
  onGenerating: () => void;
  onSuccess: (request: ConversationGenerateRequest, response: ConversationGenerateResponse) => void;
  onFailure: (error: unknown) => void;
};

interface QueuedGeneration {
  request: ConversationGenerateRequest;
  duplicateKey: string;
}

export class ConversationGenerationQueue {
  private active = false;
  private activeKey = '';
  private pending: QueuedGeneration | null = null;
  private lastSubmittedKey = '';
  private failedRequest: QueuedGeneration | null = null;
  private disposed = false;

  constructor(
    private readonly generate: (request: ConversationGenerateRequest) => Promise<ConversationGenerateResponse>,
    private readonly callbacks: GenerationCallbacks,
  ) {}

  submit(request: ConversationGenerateRequest): boolean {
    const normalizedTranscript = request.latest_finalized_transcript.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    const duplicateKey = `${request.latest_speaker}:${normalizedTranscript}`;
    if (
      this.disposed ||
      duplicateKey === this.lastSubmittedKey ||
      duplicateKey === this.activeKey ||
      duplicateKey === this.pending?.duplicateKey
    ) return false;
    this.lastSubmittedKey = duplicateKey;
    this.failedRequest = null;
    this.enqueue({ request, duplicateKey });
    return true;
  }

  retryLastFailure(): boolean {
    if (this.disposed || !this.failedRequest) return false;
    const failed = this.failedRequest;
    this.failedRequest = null;
    this.enqueue(failed);
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.pending = null;
  }

  private enqueue(item: QueuedGeneration): void {
    if (this.active) {
      this.pending = item;
      return;
    }
    void this.drain(item);
  }

  private async drain(first: QueuedGeneration): Promise<void> {
    this.active = true;
    let current: QueuedGeneration | null = first;
    while (current && !this.disposed) {
      this.activeKey = current.duplicateKey;
      this.callbacks.onGenerating();
      let result: ConversationGenerateResponse | null = null;
      let failed = false;
      let failure: unknown;
      try {
        result = await this.generate(current.request);
      } catch (error) {
        failed = true;
        failure = error;
      }

      const next = this.pending;
      this.pending = null;
      if (!this.disposed && !next) {
        if (failed) {
          this.failedRequest = current;
          this.callbacks.onFailure(failure);
        } else if (result) {
          this.failedRequest = null;
          this.callbacks.onSuccess(current.request, result);
        }
      }
      current = next;
    }
    this.active = false;
    this.activeKey = '';
  }
}

export function useConversationGeneration() {
  const [state, dispatch] = useReducer(conversationGenerationReducer, initialConversationGenerationState);
  const queueRef = useRef<ConversationGenerationQueue | null>(null);

  if (!queueRef.current) {
    queueRef.current = new ConversationGenerationQueue(generateConversationResponse, {
      onGenerating: () => dispatch({ type: 'generating' }),
      onSuccess: (request, response) => dispatch({
        type: 'draft-ready',
        transcript: request.latest_finalized_transcript,
        response,
      }),
      onFailure: (error) => dispatch({
        type: 'failed',
        message: error instanceof Error ? error.message : 'Could not generate a response draft. Try again.',
      }),
    });
  }

  useEffect(() => () => queueRef.current?.dispose(), []);

  const generateForFinalizedTranscript = useCallback((
    transcript: string,
    speaker: ConversationSpeaker,
    history: readonly ConversationHistoryTurn[],
    gesture?: ConversationGestureContext | null,
  ) => {
    try {
      const request = buildConversationGenerateRequest(transcript, speaker, history, gesture);
      if (!request) return false;
      return queueRef.current?.submit(request) ?? false;
    } catch (error) {
      dispatch({
        type: 'failed',
        message: error instanceof Error ? error.message : 'Could not prepare a response request.',
      });
      return false;
    }
  }, []);

  const retryGeneration = useCallback(() => queueRef.current?.retryLastFailure() ?? false, []);
  const editDraft = useCallback((text: string) => dispatch({ type: 'edit-draft', text }), []);
  const confirmDraft = useCallback(() => {
    const text = getConfirmableDraftText(state.draft);
    if (text) dispatch({ type: 'confirm-draft', text });
    return text;
  }, [state.draft]);

  return { ...state, generateForFinalizedTranscript, retryGeneration, editDraft, confirmDraft };
}
