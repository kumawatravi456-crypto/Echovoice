import { LIVE_HAND_FEATURE_COLUMNS, type LiveHandFeatureVector } from './liveHandFeatures';

export type HandGestureLabel = 'HELP' | 'NO' | 'STOP' | 'WATER' | 'YES';

export interface HandVideoInferenceResponse {
  frames_processed: number;
  frames_with_detected_hands: number;
  frames_with_valid_slot0_observations: number;
  predicted_label: HandGestureLabel;
  uncalibrated_scores: Record<HandGestureLabel, number>;
  score_semantics: 'uncalibrated_model_probability_scores';
  calibrated: false;
  warnings: string[];
}

export interface HandFeaturesInferenceResponse {
  predicted_label: HandGestureLabel;
  uncalibrated_scores: Record<HandGestureLabel, number>;
  score_semantics: 'uncalibrated_model_probability_scores';
  calibrated: false;
  warning: string;
}

interface ApiErrorDetail {
  message?: unknown;
}

const supportedVideoTypes: Record<string, string[]> = {
  '.mp4': ['video/mp4'],
  '.mov': ['video/quicktime'],
  '.avi': ['video/x-msvideo', 'video/avi'],
  '.mkv': ['video/x-matroska'],
  '.webm': ['video/webm'],
};

const MAX_VIDEO_BYTES = 4 * 1024 * 1024;
const gestureLabels: HandGestureLabel[] = ['HELP', 'NO', 'STOP', 'WATER', 'YES'];

function getApiBaseUrl(): string {
  const configuredBaseUrl = import.meta.env.VITE_ECHO_API_BASE_URL?.trim();
  if (!configuredBaseUrl) {
    throw new Error('Hand inference is not configured. Set VITE_ECHO_API_BASE_URL and restart the frontend.');
  }
  return configuredBaseUrl.replace(/\/+$/, '');
}

function validateVideoFile(file: File): void {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const acceptedMimeTypes = supportedVideoTypes[extension];

  if (!acceptedMimeTypes || (file.type && !acceptedMimeTypes.includes(file.type.toLowerCase()))) {
    throw new Error('Unsupported video type. Choose an MP4, MOV, AVI, MKV, or WebM video.');
  }
  if (file.size === 0) {
    throw new Error('The selected video file is empty. Choose another video.');
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error('Video upload exceeds the 4 MB limit. Choose a smaller file.');
  }
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'detail' in body) {
      const detail = (body as { detail?: unknown }).detail;
      if (typeof detail === 'string') return detail;
      if (typeof detail === 'object' && detail !== null && 'message' in detail) {
        const message = (detail as ApiErrorDetail).message;
        if (typeof message === 'string') return message;
      }
    }
  } catch {
    // Use a generic status message when the server did not return JSON.
  }
  return `Hand inference request failed (HTTP ${response.status}).`;
}

function isHandGesturePrediction(value: unknown): value is Pick<
  HandFeaturesInferenceResponse,
  'predicted_label' | 'uncalibrated_scores' | 'score_semantics' | 'calibrated'
> {
  if (typeof value !== 'object' || value === null) return false;
  const response = value as Partial<HandFeaturesInferenceResponse>;
  return (
    typeof response.predicted_label === 'string' &&
    gestureLabels.includes(response.predicted_label as HandGestureLabel) &&
    typeof response.uncalibrated_scores === 'object' &&
    response.uncalibrated_scores !== null &&
    gestureLabels.every((label) => label in response.uncalibrated_scores!) &&
    Object.keys(response.uncalibrated_scores).every((label) => gestureLabels.includes(label as HandGestureLabel)) &&
    Object.values(response.uncalibrated_scores).every(
      (score) => typeof score === 'number' && Number.isFinite(score)
    ) &&
    response.calibrated === false &&
    response.score_semantics === 'uncalibrated_model_probability_scores'
  );
}

function isHandVideoInferenceResponse(value: unknown): value is HandVideoInferenceResponse {
  if (typeof value !== 'object' || value === null) return false;
  const response = value as Partial<HandVideoInferenceResponse>;
  return (
    Number.isInteger(response.frames_processed) &&
    Number.isInteger(response.frames_with_detected_hands) &&
    Number.isInteger(response.frames_with_valid_slot0_observations) &&
    isHandGesturePrediction(value) &&
    Array.isArray(response.warnings) &&
    response.warnings.every((warning) => typeof warning === 'string')
  );
}

export async function predictHandGestureVideo(file: File): Promise<HandVideoInferenceResponse> {
  validateVideoFile(file);
  const baseUrl = getApiBaseUrl();
  const formData = new FormData();
  formData.append('file', file);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/v1/inference/hand/video`, {
      method: 'POST',
      body: formData,
    });
  } catch {
    throw new Error('Could not reach the hand inference service. Check the API URL and connection.');
  }

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error('The hand inference service returned an unreadable response.');
  }

  if (!isHandVideoInferenceResponse(result)) {
    throw new Error('The hand inference service returned an unexpected response.');
  }

  return result;
}

function isHandFeaturesInferenceResponse(value: unknown): value is HandFeaturesInferenceResponse {
  return isHandGesturePrediction(value) && typeof (value as HandFeaturesInferenceResponse).warning === 'string';
}

export async function predictHandGestureFeatures(
  features: LiveHandFeatureVector,
): Promise<HandFeaturesInferenceResponse> {
  const keys = Object.keys(features);
  if (
    keys.length !== LIVE_HAND_FEATURE_COLUMNS.length ||
    LIVE_HAND_FEATURE_COLUMNS.some((column) => !keys.includes(column)) ||
    Object.values(features).some((value) => !Number.isFinite(value))
  ) {
    throw new Error('Live hand features are incomplete or non-finite.');
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/api/v1/inference/hand/features`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ features }),
    });
  } catch {
    throw new Error('Could not reach the hand inference service. Check the API URL and connection.');
  }

  if (!response.ok) throw new Error(await readApiError(response));

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error('The hand inference service returned an unreadable response.');
  }
  if (!isHandFeaturesInferenceResponse(result)) {
    throw new Error('The hand inference service returned an unexpected response.');
  }
  return result;
}
