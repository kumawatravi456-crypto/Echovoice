import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getBrowserSpeechRecognitionFactory,
  SpeechRecognitionController,
  type SpeechRecognitionSnapshot,
} from '../speech/speechRecognition';

const initialSnapshot: SpeechRecognitionSnapshot = {
  status: 'idle',
  interimTranscript: '',
  error: '',
};

export function useSpeechTranscription(onFinalTranscript: (text: string) => void) {
  const controllerRef = useRef<SpeechRecognitionController | null>(null);
  const callbackRef = useRef(onFinalTranscript);
  const [snapshot, setSnapshot] = useState(initialSnapshot);

  useEffect(() => {
    callbackRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    const factory = typeof window === 'undefined' ? null : getBrowserSpeechRecognitionFactory(window);
    const controller = new SpeechRecognitionController(factory, {
      onChange: setSnapshot,
      onFinalTranscript: (text) => callbackRef.current(text),
    }, typeof navigator === 'undefined' ? 'en-US' : navigator.language || 'en-US');
    controllerRef.current = controller;
    setSnapshot(controller.getSnapshot());
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  const toggleListening = useCallback(() => controllerRef.current?.toggle(), []);
  const setListening = useCallback((listening: boolean) => {
    if (listening) controllerRef.current?.start();
    else controllerRef.current?.stop();
  }, []);

  return { ...snapshot, isListening: snapshot.status === 'listening' || snapshot.status === 'starting', toggleListening, setListening };
}
