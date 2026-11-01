import { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Volume2,
  Sparkles,
  Check,
  Edit3,
  Send,
  HelpCircle,
  ArrowRightLeft,
  UserCheck,
  Maximize2,
  Minimize2,
  Upload,
  MessageSquareText,
  Activity,
  LoaderCircle,
  ScanFace,
} from 'lucide-react';
import { ConversationMessage, SessionConsent } from '../types';
import { WaveformVisualizer } from '../components/WaveformVisualizer';
import { MagneticButton } from '../../components/MagneticButton';
import { GlassCard } from '../components/GlassCard';
import { PersonConversationChat } from '../components/PersonConversationChat';
import { useLiveLandmarker } from '../hooks/useLiveLandmarker';
import { useLiveTranscription } from '../hooks/useLiveTranscription';
import type { NormalizedTranscriptSegment, SpeakerRole } from '../speech/scribeTranscription';
import { toConversationSpeaker } from '../speech/scribeTranscription';
import type { LiveLandmarkerResult } from '../hooks/useLiveLandmarker';
import { useConversationGeneration } from '../hooks/useConversationGeneration';
import type { ConversationGestureContext, ConversationHistoryTurn } from '../../lib/conversationGenerationClient';

const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

function drawLandmarkOverlay(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement | null,
  result: LiveLandmarkerResult | null,
): void {
  if (!canvas || !video) return;
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, width, height);
  if (!result) return;

  const px = (x: number) => x * width;
  const py = (y: number) => y * height;
  context.lineWidth = Math.max(1.5, width / 420);
  context.strokeStyle = 'rgba(80, 255, 199, 0.9)';
  context.fillStyle = 'rgba(80, 255, 199, 0.95)';
  for (const hand of result.hands) {
    for (const [from, to] of HAND_CONNECTIONS) {
      const a = hand[from];
      const b = hand[to];
      if (!a || !b) continue;
      context.beginPath();
      context.moveTo(px(a.x), py(a.y));
      context.lineTo(px(b.x), py(b.y));
      context.stroke();
    }
    for (const point of hand) {
      context.beginPath();
      context.arc(px(point.x), py(point.y), Math.max(2, width / 280), 0, Math.PI * 2);
      context.fill();
    }
  }

  const face = result.faces[0];
  if (face) {
    context.fillStyle = 'rgba(90, 190, 255, 0.5)';
    for (const point of face) {
      context.beginPath();
      context.arc(px(point.x), py(point.y), Math.max(0.8, width / 1200), 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = 'rgba(255, 204, 112, 0.95)';
    context.lineWidth = Math.max(2, width / 350);
    for (const [from, to] of [[61, 291], [13, 14]] as const) {
      const a = face[from];
      const b = face[to];
      if (!a || !b) continue;
      context.beginPath();
      context.moveTo(px(a.x), py(a.y));
      context.lineTo(px(b.x), py(b.y));
      context.stroke();
    }
  }
}

interface ConversationChatPosition {
  left: number;
  top: number;
  width: number;
  height: number;
}

function speechStatusLabel(provider: 'scribe' | 'browser', status: string, isListening: boolean): string {
  if (provider === 'scribe') {
    if (status === 'connecting') return 'Connecting to Scribe';
    if (status === 'transcribing') return 'Listening live';
    if (status === 'connected') return 'Connected · listening';
    if (status === 'error') return 'Needs attention';
    return 'Stopped';
  }
  if (status === 'unsupported') return 'Unsupported';
  if (status === 'starting') return 'Starting';
  if (status === 'stopping') return 'Stopping';
  if (status === 'error') return 'Needs attention';
  return isListening ? 'Listening live' : 'Stopped';
}

interface LiveConversationViewProps {
  onSaveToHistory?: (message: ConversationMessage) => void;
  mediaConsent: SessionConsent;
  onRequestConsent: () => void;
}

export function LiveConversationView({ onSaveToHistory, mediaConsent, onRequestConsent }: LiveConversationViewProps) {
  // Mode selection: 'user-speaking' (Mode A) or 'partner-speaking' (Mode B)
  const [activeMode, setActiveMode] = useState<'user-speaking' | 'partner-speaking'>('user-speaking');

  // Hardware states
  const [cameraActive, setCameraActive] = useState(false);
  const [isCameraPopupOpen, setIsCameraPopupOpen] = useState(false);
  const [isConversationChatOpen, setIsConversationChatOpen] = useState(false);
  const [conversationChatPosition, setConversationChatPosition] = useState<ConversationChatPosition | null>(null);
  const [uploadedVideo, setUploadedVideo] = useState<File | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const popupVideoRef = useRef<HTMLVideoElement | null>(null);
  const popupOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const videoUploadRef = useRef<HTMLInputElement | null>(null);
  const liveVision = useLiveLandmarker(
    videoRef,
    Boolean(cameraActive && mediaConsent.camera && videoStream && activeMode === 'user-speaking'),
  );

  // Selected & editable output
  const [selectedMessage, setSelectedMessage] = useState<string>('');
  const [customInputText, setCustomInputText] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const resumeListeningAfterSpeechRef = useRef(false);
  const [spokenHistory, setSpokenHistory] = useState<ConversationMessage[]>([]);
  const spokenHistoryRef = useRef<ConversationMessage[]>([]);
  const conversationGeneration = useConversationGeneration();
  const latestGestureRef = useRef<ConversationGestureContext | null>(null);

  // Mode B: Other person speech & contextual reply suggestions
  const [partnerSpeechInput, setPartnerSpeechInput] = useState<string>('');
  const [partnerReplies] = useState<string[]>([
    'Room temperature, please.',
    'With a little ice please.',
    'No ice, just cool water.',
  ]);

  // Camera stream initialization. The browser asks permission only after session consent.
  useEffect(() => {
    setCameraActive(mediaConsent.camera);
  }, [mediaConsent.camera]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setVideoStream(null);
    if (!mediaConsent.camera || !cameraActive || activeMode !== 'user-speaking') {
      return () => { cancelled = true; };
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is not available in this browser or page context.');
      return () => { cancelled = true; };
    }

    setCameraError(null);
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } },
      })
      .then((mediaStream) => {
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = mediaStream;
        setVideoStream(mediaStream);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        const name = reason instanceof DOMException ? reason.name : '';
        setCameraError(name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in the browser and try again.'
          : 'The camera could not be opened. Check that it is connected and not in use by another app.');
      });

    return () => {
      cancelled = true;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [activeMode, cameraActive, mediaConsent.camera]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = videoStream;
    if (popupVideoRef.current) popupVideoRef.current.srcObject = videoStream;
  }, [videoStream, activeMode, isCameraPopupOpen]);

  useEffect(() => {
    drawLandmarkOverlay(overlayRef.current, videoRef.current, liveVision.result);
    drawLandmarkOverlay(popupOverlayRef.current, popupVideoRef.current, liveVision.result);
  }, [liveVision.result, videoStream, activeMode, isCameraPopupOpen]);

  useEffect(() => {
    if (popupVideoRef.current && videoStream) {
      popupVideoRef.current.srcObject = videoStream;
    }
  }, [videoStream, isCameraPopupOpen]);

  useEffect(() => {
    if (!isCameraPopupOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsCameraPopupOpen(false);
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isCameraPopupOpen]);

  useEffect(() => {
    if (!isConversationChatOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsConversationChatOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isConversationChatOpen]);

  const facialCueStatus = liveVision.mouth
    ? `Opening ${liveVision.mouth.openingImageNorm.toFixed(3)} · width ${liveVision.mouth.widthImageNorm.toFixed(3)} · movement ${liveVision.mouth.movementPerSecond.toFixed(3)}/s`
    : 'No face landmarks available';
  const detectedGesture = liveVision.prediction?.predicted_label ?? 'Waiting for 32-frame hand window';

  useEffect(() => {
    const prediction = liveVision.prediction;
    if (prediction) {
      latestGestureRef.current = {
        label: prediction.predicted_label,
        timestampMs: Date.now(),
      };
    }
  }, [liveVision.prediction]);

  const saveConversationMessage = (
    text: string,
    sender: ConversationMessage['sender'],
    wasEdited = false,
    originalTranscript = '',
    messageId?: string,
  ) => {
    const newMsg: ConversationMessage = {
      id: messageId ?? `msg-${crypto.randomUUID()}`,
      sender,
      originalTranscript,
      interpretedMessage: text,
      signalsUsed: [
        liveVision.prediction ? `Hand classifier: ${detectedGesture} (uncalibrated scores)` : 'No hand classifier result',
        liveVision.mouth ? 'Mouth movement measured locally; not interpreted as speech or intent' : 'No mouth movement measurement',
      ],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      wasEdited,
    };

    const nextHistory = [newMsg, ...spokenHistoryRef.current];
    spokenHistoryRef.current = nextHistory;
    setSpokenHistory(nextHistory);
    if (onSaveToHistory) {
      onSaveToHistory(newMsg);
    }
  };

  const speech = useLiveTranscription((segment: NormalizedTranscriptSegment) => {
    const speaker = toConversationSpeaker(segment.speakerRole);
    saveConversationMessage(segment.text, speaker, false, segment.text, segment.id);

    const history: ConversationHistoryTurn[] = spokenHistoryRef.current
      .filter((message) => message.id !== segment.id)
      .slice(0, 20)
      .reverse()
      .map((message) => ({
        speaker: message.sender,
        text: message.originalTranscript?.trim() || message.interpretedMessage.trim(),
      }))
      .filter((turn) => turn.text.length > 0);

    conversationGeneration.generateForFinalizedTranscript(
      segment.text,
      speaker,
      history,
      latestGestureRef.current,
    );
  });

  const toggleMicrophone = () => {
    if (!mediaConsent.microphone) {
      onRequestConsent();
      return;
    }
    speech.toggleListening();
  };

  useEffect(() => {
    if (!mediaConsent.microphone) speech.stopListening();
  }, [mediaConsent.microphone, speech.stopListening]);

  const correctTranscriptSpeaker = (segmentId: string, role: SpeakerRole) => {
    const updatedSegments = speech.changeSpeakerRole(segmentId, role);
    if (!updatedSegments) return;
    const byId = new Map(updatedSegments.map((segment) => [segment.id, toConversationSpeaker(segment.speakerRole)]));
    const updatedHistory = spokenHistoryRef.current.map((message) => {
      const sender = byId.get(message.id);
      return sender ? { ...message, sender } : message;
    });
    spokenHistoryRef.current = updatedHistory;
    setSpokenHistory(updatedHistory);
  };

  // Speech synthesis confirmation execution
  const speakConfirmedText = (
    text: string,
    sender: ConversationMessage['sender'] = activeMode === 'user-speaking' ? 'user' : 'partner',
  ) => {
    if (!text.trim()) return;

    resumeListeningAfterSpeechRef.current = speech.isListening;
    if (resumeListeningAfterSpeechRef.current) speech.stopListening();
    const finishSpeech = () => {
      setIsSpeaking(false);
      if (resumeListeningAfterSpeechRef.current && mediaConsent.microphone) {
        resumeListeningAfterSpeechRef.current = false;
        window.setTimeout(() => speech.startListening(), 200);
      }
    };
    setIsSpeaking(true);

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.onend = finishSpeech;
      utterance.onerror = finishSpeech;
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(finishSpeech, 1200);
    }

    saveConversationMessage(text, sender, isEditing);
  };

  const currentSpeechStatus = speechStatusLabel(speech.provider, speech.status, speech.isListening);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Mode Switcher Banner matching Landing Page navigation styling */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-3.5 rounded-3xl igloo-glass border border-white/20 shadow-xl">
        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-black/60 border border-white/10">
          <button
            onClick={() => setActiveMode('user-speaking')}
            className={`px-5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-2.5 ${
              activeMode === 'user-speaking'
                ? 'bg-white text-[#0D0D0E] shadow-[0_0_20px_rgba(255,255,255,0.35)] font-bold'
                : 'text-[#8E8E93] hover:text-white'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Mode A: I am communicating</span>
          </button>

          <button
            onClick={() => setActiveMode('partner-speaking')}
            className={`px-5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-2.5 ${
              activeMode === 'partner-speaking'
                ? 'bg-white text-[#0D0D0E] shadow-[0_0_20px_rgba(255,255,255,0.35)] font-bold'
                : 'text-[#8E8E93] hover:text-white'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Mode B: Other person speaking</span>
          </button>
        </div>

        {/* Microphone toggle for partner-speaking mode */}
        {activeMode === 'partner-speaking' && (
          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <button
              onClick={() => {
                if (!mediaConsent.microphone) {
                  onRequestConsent();
                  return;
                }
                toggleMicrophone();
              }}
              className={`p-2.5 px-3 rounded-2xl border text-xs flex items-center gap-2 transition-all cursor-pointer ${
                speech.isListening
                  ? 'bg-white/10 border-white/20 text-emerald-400 hover:border-white/40'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}
              title={speech.isListening ? 'Microphone listening' : 'Microphone stopped'}
            >
              {speech.isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              <span className="hidden md:inline font-mono text-[11px] uppercase tracking-wider">
                {currentSpeechStatus}
              </span>
            </button>
          </div>
        )}
      </div>

      {activeMode === 'user-speaking' ? (
        /* MODE A: User Communicates with Another Person */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Multimodal Sensor Feeds & Audio Waveform */}
          <div className="lg:col-span-5 space-y-6">
            {/* Visual Stream / Landmark Wireframe Display */}
            <div className="relative rounded-3xl overflow-hidden igloo-glass-elevated border border-white/20 bg-black/70 aspect-video shadow-2xl">
              {cameraActive && videoStream ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover opacity-75"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-gradient-to-b from-[#141417] to-[#0D0D0E]">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3 igloo-glow-silver">
                    <Camera className="w-7 h-7 text-white/50" />
                  </div>
                  <p className="text-xs font-mono text-[#8E8E93] uppercase tracking-wider">{cameraError ?? 'Camera preview is off'}</p>
                  <p className="text-[11px] text-[#555558] mt-1">Enable the camera to start local hand and face tracking.</p>
                </div>
              )}
              {cameraActive && videoStream && (
                <canvas ref={overlayRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none" aria-hidden="true" />
              )}

              <div className="absolute bottom-3 left-3 right-3 z-10 flex items-center justify-end gap-1.5">
                <button
                  onClick={() => {
                    if (!mediaConsent.camera) {
                      onRequestConsent();
                      return;
                    }
                    if (!cameraActive) setCameraActive(true);
                    setIsCameraPopupOpen(true);
                  }}
                  className="p-2 rounded-xl border border-white/20 bg-black/65 hover:bg-black/80 text-white/90 transition-colors cursor-pointer backdrop-blur-md"
                  title="Pop out live camera stream"
                  aria-label="Pop out live camera stream"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => {
                    if (!mediaConsent.camera) {
                      onRequestConsent();
                      return;
                    }
                    setCameraActive((active) => !active);
                  }}
                  className={`p-2 rounded-xl border text-[10px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer backdrop-blur-md ${
                    cameraActive
                      ? 'bg-black/65 border-white/20 text-emerald-300 hover:bg-black/80'
                      : 'bg-red-500/20 border-red-400/40 text-red-200 hover:bg-red-500/30'
                  }`}
                  title={cameraActive ? 'Turn camera off' : 'Turn camera on'}
                  aria-label={cameraActive ? 'Turn camera off' : 'Turn camera on'}
                >
                  {cameraActive ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5" />}
                  <span>Camera</span>
                </button>

                <button
                  onClick={() => {
                    if (!mediaConsent.microphone) {
                      onRequestConsent();
                      return;
                    }
                    toggleMicrophone();
                  }}
                  className={`p-2 rounded-xl border text-[10px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer backdrop-blur-md ${
                    speech.isListening
                      ? 'bg-black/65 border-white/20 text-emerald-300 hover:bg-black/80'
                      : 'bg-red-500/20 border-red-400/40 text-red-200 hover:bg-red-500/30'
                  }`}
                  title={speech.isListening ? 'Stop microphone' : 'Start microphone'}
                  aria-label={speech.isListening ? 'Stop microphone' : 'Start microphone'}
                >
                  {speech.isListening ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                  <span>Mic</span>
                </button>

              </div>

            </div>

            <input
              ref={videoUploadRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(event) => setUploadedVideo(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => videoUploadRef.current?.click()}
              className="w-full min-h-12 px-4 py-3 rounded-2xl border border-white/20 bg-white/[0.04] hover:bg-white/[0.09] hover:border-white/35 text-sm text-white transition-colors cursor-pointer flex items-center justify-center gap-2.5"
            >
              <Upload className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">{uploadedVideo ? uploadedVideo.name : 'Upload a video'}</span>
            </button>

            {/* Camera status and gesture details stay outside the live video frame. */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="px-3 py-1 rounded-full bg-black/80 border border-white/20 text-[10px] font-mono text-emerald-400 font-semibold tracking-wider flex items-center gap-1.5">
                  {liveVision.status === 'tracking' ? <Activity className="w-3 h-3" /> : <ScanFace className="w-3 h-3" />}
                  {liveVision.status === 'tracking' ? 'LOCAL TRACKING' : liveVision.status.toUpperCase()}
                </span>
                <span className="text-[10px] font-mono text-[#8E8E93]">Hands {liveVision.result?.hands.length ?? 0} · Face {liveVision.result?.faces.length ? 'detected' : 'not detected'}</span>
              </div>

              <div className="p-4 rounded-2xl bg-[#0D0D0E]/85 border border-white/20 shadow-xl">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#8E8E93] uppercase tracking-wider">Live hand gesture</span>
                  <span className="text-emerald-400 font-bold">{liveVision.isClassifying ? <LoaderCircle className="w-4 h-4 animate-spin" /> : liveVision.prediction ? 'Sensor output' : 'Collecting frames'}</span>
                </div>
                <p className="text-sm font-semibold text-white mt-1.5">{detectedGesture}</p>
                <p className="mt-1 text-[10px] font-mono text-[#8E8E93]">32-frame window · {liveVision.result?.validSlot0Frames ?? 0} valid slot-0 frames</p>
                {liveVision.prediction && <p className="mt-2 text-[10px] font-mono text-amber-200">{liveVision.prediction.warning} These values are not reliable confidence percentages.</p>}
                {liveVision.prediction && <div className="mt-2 grid grid-cols-5 gap-1 text-[9px] font-mono text-[#A1A1AA]">{Object.entries(liveVision.prediction.uncalibrated_scores).map(([label, score]) => <span key={label}>{label} {score.toFixed(2)}</span>)}</div>}
                {liveVision.error && <p role="alert" className="mt-2 text-xs text-rose-300">{liveVision.error}</p>}
                {liveVision.predictionError && <p role="alert" className="mt-2 text-xs text-rose-300">{liveVision.predictionError}</p>}
                {cameraError && <p role="alert" className="mt-2 text-xs text-rose-300">{cameraError}</p>}
              </div>
            </div>

            {/* Supporting Acoustic Waveform & Speech Transcription */}
            <GlassCard className="p-6 space-y-4 person-chat-anchor">
              <div className="flex items-center justify-between text-xs font-mono text-[#8E8E93]">
                <span className="flex items-center gap-2">
                  <Mic className="w-4 h-4 text-white" />
                  <span className="uppercase tracking-wider">Live Speech Audio Stream</span>
                </span>
                <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-white font-medium">
                  <span className="hidden sm:inline">Speech provider</span>
                  <select
                    value={speech.provider}
                    onChange={(event) => speech.setProvider(event.target.value as 'scribe' | 'browser')}
                    className="rounded-lg border border-white/15 bg-black/70 px-2 py-1 text-[10px] text-white outline-none"
                    aria-label="Speech recognition provider"
                  >
                    <option value="scribe">ElevenLabs Scribe · remote</option>
                    <option value="browser">Browser fallback</option>
                  </select>
                </label>
                  <button
                    type="button"
                    onClick={(event) => {
                      const column = event.currentTarget.closest('.person-chat-anchor') as HTMLElement | null;
                      const bounds = (column ?? event.currentTarget).getBoundingClientRect();
                      const width = Math.min(420, bounds.width, window.innerWidth - 24);
                      const height = Math.min(620, window.innerHeight - 24);
                      const left = Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12));
                      let top = bounds.top + 12;
                      if (top + height > window.innerHeight - 12) {
                        top = Math.max(12, window.innerHeight - height - 12);
                      }
                      setConversationChatPosition({ left, top, width, height });
                      setIsConversationChatOpen(true);
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] px-2.5 py-1.5 font-mono text-[9px] tracking-wider text-emerald-200 transition-colors hover:border-emerald-200/40 hover:bg-emerald-300/[0.12]"
                    aria-label="Open person-to-person voice chat"
                    title="Open voice chat between people"
                  >
                    <MessageSquareText className="h-3.5 w-3.5" />
                    <span>VOICE CHAT</span>
                  </button>
                </div>
              </div>

              {/* Live Audio Waveform */}
              <div className="p-3.5 rounded-2xl bg-black/50 border border-white/10 flex items-center justify-between">
                <WaveformVisualizer isActive={speech.isListening} barsCount={24} variant="silver" />
                <button
                  type="button"
                  onClick={() => {
                    if (!mediaConsent.microphone) {
                      onRequestConsent();
                      return;
                    }
                    toggleMicrophone();
                  }}
                  className={`rounded-lg px-2 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors cursor-pointer ${
                    speech.isListening
                      ? 'text-emerald-400 hover:bg-emerald-400/10'
                      : 'text-[#8E8E93] hover:bg-white/10 hover:text-white'
                  }`}
                  aria-label={speech.isListening ? 'Stop microphone' : 'Start microphone'}
                  title={speech.isListening ? 'Stop speech recognition' : 'Start speech recognition'}
                  aria-pressed={speech.isListening}
                >
                  {currentSpeechStatus}
                </button>
              </div>

              <p className="text-sm font-mono text-[#D1D1D6] p-4 rounded-xl bg-black/40 border border-white/10 leading-relaxed">
                Microphone audio is streamed to ElevenLabs Scribe for remote transcription when selected; Echo does not persist raw audio by default. Browser fallback uses the browser's speech service. Camera frames, face landmarks, and mouth-motion measurements stay local. Finalized transcript text and recent conversation text may be sent to the conversation service for a response draft. Drafts are never spoken automatically.
              </p>

              <div className="space-y-2 rounded-xl border border-white/10 bg-black/35 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#8E8E93]">Microphone</span>
                  <span className={`text-[10px] font-mono uppercase tracking-wider ${speech.isListening ? 'text-emerald-300' : speech.status === 'error' ? 'text-rose-300' : 'text-[#8E8E93]'}`} aria-live="polite">
                    {currentSpeechStatus}
                  </span>
                </div>
                {speech.error && <p className={`text-xs ${speech.error.startsWith('No speech') ? 'text-amber-200' : 'text-rose-300'}`} role={speech.error.startsWith('No speech') ? 'status' : 'alert'}>{speech.error}</p>}
                <div className="rounded-lg border border-emerald-300/10 bg-emerald-300/[0.04] px-3 py-2" aria-live="polite">
                  <span className="block text-[9px] font-mono uppercase tracking-wider text-emerald-300/70">Interim transcript</span>
                  <p className="mt-1 min-h-5 text-sm italic text-emerald-50/80">{speech.interimTranscript || (speech.isListening ? 'Listening for speech…' : 'No interim speech')}</p>
                </div>
                <div>
                  <span className="text-[9px] font-mono uppercase tracking-wider text-[#8E8E93]">Finalized transcript</span>
                  <div className="mt-2 max-h-36 space-y-2 overflow-y-auto" aria-live="polite">
                    {speech.segments.length === 0 ? <p className="text-xs text-[#77777D]">Final speech segments will appear here once recognized.</p> : speech.segments.map((segment) => (
                      <div key={segment.id} className="space-y-2 rounded-lg bg-white/[0.035] px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm text-white">{segment.text}</p>
                          <time className="shrink-0 text-[9px] font-mono text-[#77777D]">
                            {segment.startTimeSeconds !== null ? `${segment.startTimeSeconds.toFixed(1)}s` : new Date(segment.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </time>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="text-[9px] font-mono uppercase tracking-wider text-[#8E8E93]" htmlFor={`speaker-${segment.id}`}>Speaker</label>
                          <select
                            id={`speaker-${segment.id}`}
                            value={segment.speakerRole}
                            onChange={(event) => correctTranscriptSpeaker(segment.id, event.target.value as SpeakerRole)}
                            className="rounded-md border border-white/10 bg-black/50 px-1.5 py-1 text-[9px] text-white"
                          >
                            <option value="UNKNOWN">Unknown</option>
                            <option value="PARTNER">Partner</option>
                            <option value="ECHO_USER">Echo user</option>
                          </select>
                          <span className="text-[9px] font-mono text-[#77777D]">{segment.provider === 'scribe' ? 'Scribe' : 'Browser fallback'}</span>
                          {segment.providerSpeakerLabel && <span className="text-[9px] font-mono text-[#77777D]">Provider label: {segment.providerSpeakerLabel}</span>}
                          {segment.languageCode && <span className="text-[9px] font-mono text-[#77777D]">{segment.languageCode}</span>}
                          <span className="text-[9px] font-mono text-[#77777D]">Speaker confidence: {segment.speakerConfidence === null ? 'unavailable' : segment.speakerConfidence.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-mono text-[#8E8E93] pt-3 border-t border-white/10">
                <span className="uppercase tracking-wider">Mouth motion (not speech recognition):</span>
                <span className="text-white font-mono text-[11px]">{facialCueStatus}</span>
              </div>
            </GlassCard>

            {/* Assistive Technology Standard Notice */}
            <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.02] text-xs text-[#8E8E93] leading-relaxed flex items-start gap-3">
              <HelpCircle className="w-4 h-4 text-white/50 shrink-0 mt-0.5" />
              <p>
                Mouth opening, width and movement are image-normalized motion indicators only. They do not provide lip-reading, words, emotion or intent.
              </p>
            </div>
          </div>

          {/* Right Column: AI Interpretation & Confirmation Gate */}
          <div className="lg:col-span-7 space-y-6">
            <GlassCard elevated className="p-8 space-y-6">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 mb-2">
                  <Sparkles className="w-4 h-4" />
                  <span className="tracking-wider uppercase">LIVE SENSOR SIGNALS</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white font-display">
                  Detected gesture
                </h2>
                <p className="text-xs text-[#8E8E93] mt-1.5 leading-relaxed">
                  A gesture label is a sensor output, not a complete message or inferred intent. Speech synthesis remains behind explicit user confirmation.
                </p>
              </div>

              <section className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.035] p-5 space-y-3" aria-label="AI response draft">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-emerald-200">
                    <Sparkles className="h-4 w-4" />
                    <span>AI response draft</span>
                  </div>
                  {conversationGeneration.status === 'generating' && (
                    <span className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-200" role="status">
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Generating
                    </span>
                  )}
                  {conversationGeneration.status === 'draft-ready' && !conversationGeneration.confirmedResponse && (
                    <span className="text-[10px] font-mono text-emerald-200">Draft ready · review before use</span>
                  )}
                </div>

                {conversationGeneration.draft ? (
                  <>
                    <p className="text-[11px] leading-relaxed text-[#A1A1AA]">
                      Based on finalized speech: “{conversationGeneration.draft.sourceTranscript}”
                    </p>
                    <textarea
                      rows={3}
                      aria-label="Edit AI response draft"
                      value={conversationGeneration.draft.suggestedResponse}
                      onChange={(event) => conversationGeneration.editDraft(event.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-black/40 p-3.5 text-sm leading-relaxed text-white focus:border-emerald-200/50 focus:outline-none"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-[10px] leading-relaxed text-[#A1A1AA]">
                        {conversationGeneration.draft.gestureContextUsed
                          ? 'A recent hand gesture was included as supplementary context.'
                          : 'Transcript and conversation history only; no fresh gesture was included.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const confirmed = conversationGeneration.confirmDraft();
                          if (confirmed) {
                            setSelectedMessage(confirmed);
                            setIsEditing(false);
                          }
                        }}
                        disabled={!conversationGeneration.draft.suggestedResponse.trim()}
                        className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-[#0D0D0E] transition-colors hover:bg-[#F0F0F2] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Check className="h-3.5 w-3.5" /> Confirm draft for review
                      </button>
                    </div>
                    {conversationGeneration.draft.warnings.length > 0 && (
                      <details className="text-[10px] text-amber-100/80">
                        <summary className="cursor-pointer">Context and safety notes ({conversationGeneration.draft.warnings.length})</summary>
                        <ul className="mt-2 list-disc space-y-1 pl-4">
                          {conversationGeneration.draft.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
                        </ul>
                      </details>
                    )}
                  </>
                ) : conversationGeneration.status === 'generating' ? (
                  <p className="text-sm text-[#D1D1D6]" role="status">Preparing a response draft from finalized speech…</p>
                ) : (
                  <p className="text-sm text-[#8E8E93]">Start speech recognition and finalize a transcript to request a response draft.</p>
                )}

                {conversationGeneration.confirmedResponse && (
                  <p className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-2 text-[11px] text-emerald-100" role="status">
                    Draft confirmed and copied to message review below. No audio was played.
                  </p>
                )}
                {conversationGeneration.error && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-300/20 bg-rose-300/[0.05] p-3" role="alert">
                    <p className="text-xs text-rose-200">{conversationGeneration.error}</p>
                    <button
                      type="button"
                      onClick={conversationGeneration.retryGeneration}
                      className="rounded-lg border border-rose-200/25 px-3 py-1.5 text-[10px] font-mono text-rose-100 hover:bg-rose-200/10"
                    >
                      Retry draft
                    </button>
                  </div>
                )}
              </section>

              {/* Message Review & Confirmation Area */}
              <div className="p-6 rounded-2xl bg-black/50 border border-white/15 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-[#8E8E93] uppercase tracking-wider">
                    Confirmed Message to Speak
                  </span>
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="text-xs font-mono text-white/80 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{isEditing ? 'Done Editing' : 'Edit Message'}</span>
                  </button>
                </div>

                {isEditing ? (
                  <textarea
                    rows={2}
                    value={selectedMessage}
                    onChange={(e) => setSelectedMessage(e.target.value)}
                    className="w-full rounded-xl bg-[#0D0D0E] border border-white/30 p-4 text-base text-white focus:outline-none focus:border-white leading-relaxed"
                  />
                ) : (
                  <p className="text-lg font-medium text-white p-4 rounded-xl bg-white/[0.04] border border-white/10 min-h-[56px] flex items-center leading-relaxed">
                    {selectedMessage || <span className="text-[#77777D] italic">Select or type a message below</span>}
                  </p>
                )}

                {/* Primary Spoken Output Button */}
                <MagneticButton
                  onClick={() => speakConfirmedText(selectedMessage)}
                  soundPitch={880}
                  className="w-full py-4 px-6 rounded-2xl bg-white text-[#0D0D0E] font-bold text-base hover:bg-[#F0F0F2] transition-all flex items-center justify-center gap-3 cursor-pointer shadow-[0_0_35px_rgba(255,255,255,0.4)] hover:shadow-[0_0_45px_rgba(255,255,255,0.6)]"
                >
                  <Volume2 className="w-5 h-5 text-[#0D0D0E]" />
                  <span>{isSpeaking ? 'Speaking Output...' : 'Speak Confirmed Message'}</span>
                </MagneticButton>
              </div>

              {/* Manual Input Fallback */}
              <div className="pt-2">
                <p className="text-xs font-mono text-[#8E8E93] uppercase mb-2">Manual Input Fallback</p>
                <div className="flex items-center gap-2.5">
                  <input
                    type="text"
                    value={customInputText}
                    onChange={(e) => setCustomInputText(e.target.value)}
                    placeholder="Type words directly if sensors are resting..."
                    className="flex-1 rounded-2xl bg-[#0D0D0E] border border-white/15 px-4 py-3 text-sm text-white placeholder:text-[#77777D] focus:outline-none focus:border-white/40"
                  />
                  <MagneticButton
                    onClick={() => {
                      if (customInputText.trim()) {
                        setSelectedMessage(customInputText.trim());
                        speakConfirmedText(customInputText.trim());
                        setCustomInputText('');
                      }
                    }}
                    soundPitch={800}
                    className="px-6 py-3 rounded-2xl bg-white/10 hover:bg-white text-white hover:text-[#0D0D0E] border border-white/20 text-sm font-semibold flex items-center gap-2 cursor-pointer transition-all active:scale-95 shadow-md"
                  >
                    <Send className="w-4 h-4" />
                    <span>Speak</span>
                  </MagneticButton>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      ) : (
        /* MODE B: Other Person Communicates with the User */
        <div className="max-w-4xl mx-auto space-y-6">
          <GlassCard elevated className="p-8 sm:p-12 space-y-8">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-blue-400 mb-2">
                <ArrowRightLeft className="w-4 h-4" />
                <span className="uppercase tracking-wider">PARTNER INCOMING SPEECH TRANSCRIPTION</span>
              </div>
              <h2 className="text-3xl font-bold text-white font-display">
                What the other person just said
              </h2>
              <p className="text-xs text-[#8E8E93] mt-1.5 leading-relaxed">
                Browser speech recognition is available in supported browsers. Transcription is not connected to a cloud speech service.
              </p>
            </div>

            {/* Other Person Speech Card */}
            <div className="p-6 rounded-2xl bg-white/[0.04] border border-white/15 space-y-3.5">
              <div className="flex items-center justify-between text-xs font-mono text-[#8E8E93]">
                <span className="uppercase tracking-wider">Partner Speech Transcription</span>
                <span className="text-[#8E8E93] font-semibold">Manual transcript</span>
              </div>
              <textarea
                rows={2}
                value={partnerSpeechInput}
                onChange={(e) => setPartnerSpeechInput(e.target.value)}
                placeholder="Partner spoken words appear here..."
                className="w-full rounded-xl bg-[#0D0D0E] border border-white/20 p-4 text-lg text-white font-medium focus:outline-none focus:border-white leading-relaxed"
              />
            </div>

            {/* Suggested Contextual Responses */}
            <div className="space-y-4">
              <p className="text-xs font-mono text-[#8E8E93] uppercase tracking-wider">Suggested Quick Responses</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {partnerReplies.map((reply, i) => (
                  <button
                    key={i}
                    onClick={() => speakConfirmedText(reply)}
                    className="p-5 rounded-2xl igloo-glass border border-white/15 hover:border-white/40 hover:bg-white/[0.08] text-left text-sm font-semibold text-white transition-all flex flex-col justify-between gap-4 cursor-pointer group shadow-lg"
                  >
                    <span className="leading-snug">{reply}</span>
                    <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5 group-hover:underline">
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Confirm & Speak</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {isConversationChatOpen && conversationChatPosition && (
        <div
          className="fixed inset-0 z-[79]"
          onClick={() => setIsConversationChatOpen(false)}
        >
          <PersonConversationChat
            messages={spokenHistory}
            position={conversationChatPosition}
            isListening={speech.isListening}
            interimTranscript={speech.interimTranscript}
            voiceError={speech.error}
            onToggleListening={toggleMicrophone}
            onClose={() => setIsConversationChatOpen(false)}
            onSpeakText={(text, speaker) => speakConfirmedText(text, speaker)}
          />
        </div>
      )}

      {isCameraPopupOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
          onClick={() => setIsCameraPopupOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Live camera stream"
            className="relative w-screen h-screen overflow-hidden bg-black"
            onClick={(event) => event.stopPropagation()}
          >
            {cameraActive && videoStream ? (
              <video
                ref={popupVideoRef}
                autoPlay
                playsInline
                muted
                className="block w-full h-full object-contain bg-black"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm font-mono text-white/60">
                Starting camera stream…
              </div>
            )}
            {cameraActive && videoStream && (
              <canvas ref={popupOverlayRef} className="absolute inset-0 w-full h-full object-contain pointer-events-none" aria-hidden="true" />
            )}
            <div className="absolute top-3 left-3 rounded-full bg-black/70 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-emerald-300 border border-white/15">
              Live camera
            </div>
            <button
              onClick={() => setIsCameraPopupOpen(false)}
              className="absolute top-3 right-3 p-2.5 rounded-full bg-black/70 hover:bg-black/90 border border-white/20 text-white transition-colors cursor-pointer"
              aria-label="Minimize camera to preview column"
              title="Minimize camera"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Spoken Session Log Strip */}
      {spokenHistory.length > 0 && (
        <GlassCard className="p-6 space-y-3">
          <p className="text-xs font-mono text-[#8E8E93] uppercase tracking-wider">Active Session Spoken Logs</p>
          <div className="space-y-2.5 max-h-48 overflow-y-auto">
            {spokenHistory.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm"
              >
                <div className="flex items-center gap-2.5">
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-white font-medium">{item.interpretedMessage}</span>
                </div>
                <span className="text-xs font-mono text-[#8E8E93]">{item.timestamp}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
