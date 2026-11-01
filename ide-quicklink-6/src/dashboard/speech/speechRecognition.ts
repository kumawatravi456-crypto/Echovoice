export interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

export interface SpeechRecognitionResultLike {
  0?: SpeechRecognitionAlternativeLike;
  isFinal?: boolean;
}

export interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
  resultIndex?: number;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export type SpeechStatus = 'unsupported' | 'idle' | 'starting' | 'listening' | 'stopping' | 'error';

export interface SpeechRecognitionSnapshot {
  status: SpeechStatus;
  interimTranscript: string;
  error: string;
}

export interface SpeechRecognitionCallbacks {
  onChange: (snapshot: SpeechRecognitionSnapshot) => void;
  onFinalTranscript: (text: string) => void;
}

type Timer = ReturnType<typeof setTimeout>;

const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 300;

export class SpeechRecognitionController {
  private recognition: SpeechRecognitionLike | null = null;
  private desiredListening = false;
  private disposed = false;
  private restartCount = 0;
  private restartTimer: Timer | null = null;
  private readonly finalizedResultIndexes = new Set<number>();
  private snapshot: SpeechRecognitionSnapshot;

  constructor(
    private readonly createRecognition: (() => SpeechRecognitionLike) | null,
    private readonly callbacks: SpeechRecognitionCallbacks,
    private readonly language: string,
  ) {
    this.snapshot = {
      status: createRecognition ? 'idle' : 'unsupported',
      interimTranscript: '',
      error: '',
    };
  }

  getSnapshot(): SpeechRecognitionSnapshot {
    return this.snapshot;
  }

  toggle(): void {
    if (this.snapshot.status === 'listening' || this.snapshot.status === 'starting') {
      this.stop();
    } else {
      this.start();
    }
  }

  start(): void {
    if (this.disposed || this.desiredListening || this.snapshot.status === 'unsupported') return;
    this.desiredListening = true;
    this.restartCount = 0;
    this.finalizedResultIndexes.clear();
    this.update({ status: 'starting', interimTranscript: '', error: '' });
    this.createAndStart();
  }

  stop(): void {
    if (this.disposed || !this.desiredListening) return;
    this.desiredListening = false;
    this.clearRestartTimer();
    const recognition = this.recognition;
    if (!recognition) {
      this.update({ status: 'idle', interimTranscript: '' });
      return;
    }
    this.update({ status: 'stopping', interimTranscript: '' });
    try {
      recognition.stop();
    } catch {
      this.detachRecognition(recognition);
      this.update({ status: 'idle', interimTranscript: '' });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.desiredListening = false;
    this.clearRestartTimer();
    const recognition = this.recognition;
    this.recognition = null;
    if (recognition) {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        // The recognition session may already be stopped by the browser.
      }
    }
  }

  private createAndStart(): void {
    if (!this.desiredListening || this.disposed) return;
    try {
      const recognition = this.recognition ?? this.createRecognition?.();
      if (!recognition) {
        this.fail('Voice transcription is not available in this browser.');
        return;
      }
      this.recognition = recognition;
      recognition.lang = this.language;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onstart = () => {
        if (!this.desiredListening || this.disposed) return;
        this.update({ status: 'listening' });
      };
      recognition.onresult = (event) => this.handleResult(event);
      recognition.onerror = (event) => this.handleError(event.error ?? '');
      recognition.onend = () => this.handleEnd();
      recognition.start();
    } catch {
      this.fail('Voice input could not start. Check microphone permission and try again.');
    }
  }

  private handleResult(event: SpeechRecognitionEventLike): void {
    if (this.disposed) return;
    const interim: string[] = [];
    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = result?.[0]?.transcript?.trim();
      if (!text) continue;
      if (result.isFinal) {
        if (!this.finalizedResultIndexes.has(index)) {
          this.finalizedResultIndexes.add(index);
          this.callbacks.onFinalTranscript(text);
        }
      } else {
        interim.push(text);
      }
    }
    this.update({ interimTranscript: interim.join(' '), error: '' });
  }

  private handleError(error: string): void {
    if (this.disposed) return;
    if (error === 'no-speech') {
      this.update({ error: 'No speech detected yet. Listening continues.' });
      return;
    }
    if (error === 'aborted') {
      if (this.desiredListening) this.update({ error: 'Speech recognition was interrupted. Trying to resume…' });
      return;
    }
    if (error === 'not-allowed' || error === 'service-not-allowed') {
      this.fail('Microphone permission was denied or blocked. Allow microphone access in your browser to continue.');
      return;
    }
    this.fail(error === 'audio-capture'
      ? 'No usable microphone is available. Check your microphone and try again.'
      : 'Voice recognition stopped unexpectedly. Try starting the microphone again.');
  }

  private handleEnd(): void {
    if (this.disposed) return;
    if (!this.desiredListening) {
      this.detachRecognition(this.recognition);
      this.finalizedResultIndexes.clear();
      this.update({ status: 'idle', interimTranscript: '' });
      return;
    }
    if (this.restartCount >= MAX_RESTARTS) {
      this.fail('Voice recognition kept ending. Restart the microphone to continue.');
      return;
    }
    this.restartCount += 1;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.desiredListening || this.disposed) return;
      this.finalizedResultIndexes.clear();
      this.update({ status: 'starting', interimTranscript: '' });
      this.createAndStart();
    }, RESTART_DELAY_MS);
  }

  private fail(message: string): void {
    this.desiredListening = false;
    this.clearRestartTimer();
    const recognition = this.recognition;
    this.detachRecognition(recognition);
    try {
      recognition?.stop();
    } catch {
      // Ignore errors while closing a browser-owned recognition session.
    }
    this.update({ status: 'error', interimTranscript: '', error: message });
  }

  private detachRecognition(recognition: SpeechRecognitionLike | null): void {
    if (!recognition) return;
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    if (this.recognition === recognition) this.recognition = null;
  }

  private clearRestartTimer(): void {
    if (this.restartTimer !== null) clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private update(next: Partial<SpeechRecognitionSnapshot>): void {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...next };
    this.callbacks.onChange(this.snapshot);
  }
}

export function getBrowserSpeechRecognitionFactory(
  speechWindow: Window,
): (() => SpeechRecognitionLike) | null {
  const compatibleWindow = speechWindow as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Recognition = compatibleWindow.SpeechRecognition ?? compatibleWindow.webkitSpeechRecognition;
  return Recognition ? () => new Recognition() : null;
}
