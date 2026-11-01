import { CommitStrategy, useScribe } from '@elevenlabs/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { requestScribeToken } from '../../lib/scribeTokenClient';
import { useSpeechTranscription } from './useSpeechTranscription';
import {
  attachScribeTimestamps,
  correctSpeakerRole,
  normalizeBrowserTranscript,
  normalizeScribeTranscript,
  type NormalizedTranscriptSegment,
  type SpeakerRole,
  type SpeakerRoleMappings,
} from '../speech/scribeTranscription';
import { ScribeSessionController } from '../speech/scribeSession';

export type SpeechProvider = 'scribe' | 'browser';

const microphoneOptions = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
} as const;
const realtimeLanguages = ['eng', 'hin'];

export function useLiveTranscription(onFinalizedSegment?: (segment: NormalizedTranscriptSegment) => void) {
  const [provider, setProvider] = useState<SpeechProvider>('scribe');
  const [segments, setSegments] = useState<NormalizedTranscriptSegment[]>([]);
  const [speakerMappings, setSpeakerMappings] = useState<Record<string, SpeakerRole>>({});
  const [sessionError, setSessionError] = useState<string | null>(null);
  const callbackDataRef = useRef({ speakerMappings });
  callbackDataRef.current.speakerMappings = speakerMappings;
  const finalizedCallbackRef = useRef(onFinalizedSegment);
  finalizedCallbackRef.current = onFinalizedSegment;
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const controllerRef = useRef<ScribeSessionController | null>(null);

  const append = useCallback((segment: NormalizedTranscriptSegment | null) => {
    if (!segment) return;
    const current = { ...segment };
    if (current.providerSpeakerLabel) {
      current.speakerRole = callbackDataRef.current.speakerMappings[current.providerSpeakerLabel] ?? 'UNKNOWN';
    }
    const next = [...segmentsRef.current, current];
    segmentsRef.current = next;
    setSegments(next);
    finalizedCallbackRef.current?.(current);
  }, []);

  const browser = useSpeechTranscription((text) => append(normalizeBrowserTranscript(text)));

  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    commitStrategy: CommitStrategy.VAD,
    secondaryLanguages: realtimeLanguages,
    includeTimestamps: true,
    includeLanguageDetection: true,
    microphone: microphoneOptions,
    onCommittedTranscript: (data) => append(normalizeScribeTranscript({
      text: data.text,
      speakerMappings: callbackDataRef.current.speakerMappings,
    })),
    onCommittedTranscriptWithTimestamps: (data) => {
      const next = attachScribeTimestamps(segmentsRef.current, {
        text: data.text,
        words: data.words,
        languageCode: data.language_code,
      }, callbackDataRef.current.speakerMappings);
      segmentsRef.current = next;
      setSegments(next);
    },
    onDisconnect: () => controllerRef.current?.markDisconnected(),
    onAuthError: () => setSessionError('ElevenLabs rejected the live transcription session. Check account access and try again.'),
    onUnacceptedTermsError: () => setSessionError('Accept the ElevenLabs Scribe terms for this account before starting transcription.'),
    onError: () => setSessionError('Live transcription encountered an error. Stop and try again.'),
  });

  if (!controllerRef.current) {
    controllerRef.current = new ScribeSessionController(
      requestScribeToken,
      ({ token }) => scribe.connect({ token }),
      () => scribe.disconnect(),
      setSessionError,
    );
  }
  useEffect(() => () => controllerRef.current?.dispose(), []);

  const isListening = provider === 'scribe'
    ? scribe.status === 'connecting' || scribe.isConnected
    : browser.isListening;
  const interimTranscript = provider === 'scribe' ? scribe.partialTranscript : browser.interimTranscript;
  const error = provider === 'scribe' ? sessionError ?? scribe.error : browser.error;

  const stopListening = useCallback(() => {
    controllerRef.current?.stop();
    browser.setListening(false);
  }, [browser.setListening]);

  const startListening = useCallback(() => {
    if (provider === 'scribe') void controllerRef.current?.start();
    else browser.setListening(true);
  }, [browser.setListening, provider]);

  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  const changeProvider = useCallback((nextProvider: SpeechProvider) => {
    stopListening();
    setSessionError(null);
    setProvider(nextProvider);
  }, [stopListening]);

  const changeSpeakerRole = useCallback((segmentId: string, role: SpeakerRole) => {
    const selected = segmentsRef.current.find((segment) => segment.id === segmentId);
    if (!selected) return;
    if (selected.providerSpeakerLabel) {
      setSpeakerMappings((previous) => ({ ...previous, [selected.providerSpeakerLabel!]: role }));
    }
    const next = correctSpeakerRole(segmentsRef.current, segmentId, role);
    segmentsRef.current = next;
    setSegments(next);
    return next;
  }, []);

  return {
    provider,
    setProvider: changeProvider,
    status: provider === 'scribe' ? scribe.status : browser.status,
    isListening,
    interimTranscript,
    error,
    segments,
    toggleListening,
    startListening,
    stopListening,
    changeSpeakerRole,
  };
}
