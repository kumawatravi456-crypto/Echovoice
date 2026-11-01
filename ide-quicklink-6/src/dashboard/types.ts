export type DashboardTab =
  | 'overview'
  | 'live-conversation'
  | 'gestures'
  | 'history'
  | 'vocabulary'
  | 'voice-settings'
  | 'accessibility'
  | 'profile'
  | 'help';

export interface SessionConsent {
  camera: boolean;
  microphone: boolean;
  voiceCloning: boolean;
}

export interface GestureItem {
  id: string;
  name: string;
  mappedMessage: string;
  category: 'core' | 'custom';
  confidence: number;
  enabled: boolean;
  handIcon: string;
  samplesCount: number;
  lastTrained: string;
  description: string;
  referenceVideo?: File;
}

export interface SuggestedMessage {
  id: string;
  text: string;
  confidence: number; // 0 to 1
  label: 'High Confidence' | 'Moderate Confidence' | 'Needs Confirmation';
  signals: {
    speechCue?: string;
    gestureCue?: string;
    facialCue?: string;
  };
}

export interface ConversationMessage {
  id: string;
  sender: 'user' | 'partner' | 'unknown';
  originalTranscript?: string;
  interpretedMessage: string;
  signalsUsed?: string[];
  confidence?: number;
  timestamp: string;
  wasEdited?: boolean;
}

export interface ConversationSession {
  id: string;
  title: string;
  date: string;
  duration: string;
  messageCount: number;
  preview: string;
  messages: ConversationMessage[];
}

export interface VocabularyPhrase {
  id: string;
  phrase: string;
  category: 'basic-needs' | 'emergency' | 'daily' | 'questions' | 'personal';
  shortcutCode?: string;
  associatedGestureId?: string;
  useCount: number;
  lastUsed?: string;
}

export interface VoiceSettings {
  language: 'en-US' | 'hi-IN' | 'en-IN';
  voiceURI: string;
  pitch: number; // 0.5 to 2.0
  rate: number; // 0.5 to 2.0
  volume: number; // 0 to 1
  autoSpeakConfirmed: boolean;
}

export interface AccessibilitySettings {
  fontSize: 'normal' | 'large' | 'extra-large';
  highContrast: boolean;
  reducedMotion: boolean;
  largeTouchTargets: boolean;
  audioFeedback: boolean;
}
