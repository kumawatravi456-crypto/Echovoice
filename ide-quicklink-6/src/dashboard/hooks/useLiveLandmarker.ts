import { useEffect, useState, type RefObject } from 'react';
import {
  predictHandGestureFeatures,
  type HandFeaturesInferenceResponse,
} from '../../lib/handInferenceClient';
import { computeSlot0HandFeatures, type LiveLandmark } from '../../lib/liveHandFeatures';

export interface LiveLandmarkerResult {
  timestampMs: number;
  hands: LiveLandmark[][];
  faces: LiveLandmark[][];
  handWindowFrames: number;
  validSlot0Frames: number;
}

export interface MouthMotionMetrics {
  openingImageNorm: number;
  widthImageNorm: number;
  openingRatio: number;
  movementPerSecond: number;
}

type TrackerStatus = 'idle' | 'initializing' | 'tracking' | 'error';

interface WorkerResponse {
  type: 'ready' | 'disposed' | 'error' | 'result';
  stage?: 'initialization' | 'detection';
  timestampMs?: number;
  hands?: LiveLandmark[][];
  faces?: LiveLandmark[][];
}

interface WorkerRequest {
  type: 'init' | 'dispose' | 'frame';
  bitmap?: ImageBitmap;
  timestampMs?: number;
}

function mouthMetrics(
  landmarks: readonly LiveLandmark[] | undefined,
  timestampMs: number,
  history: Array<{ timestampMs: number; openingRatio: number }>,
): MouthMotionMetrics | null {
  if (!landmarks || landmarks.length <= 291) return null;
  const upperInner = landmarks[13];
  const lowerInner = landmarks[14];
  const leftCorner = landmarks[61];
  const rightCorner = landmarks[291];
  const pointIsFinite = ({ x, y, z }: LiveLandmark) => [x, y, z].every(Number.isFinite);
  if (![upperInner, lowerInner, leftCorner, rightCorner].every(pointIsFinite)) return null;

  const openingImageNorm = Math.hypot(upperInner.x - lowerInner.x, upperInner.y - lowerInner.y);
  const widthImageNorm = Math.hypot(leftCorner.x - rightCorner.x, leftCorner.y - rightCorner.y);
  if (!Number.isFinite(openingImageNorm) || !Number.isFinite(widthImageNorm) || widthImageNorm <= 0) return null;
  const openingRatio = openingImageNorm / widthImageNorm;
  history.push({ timestampMs, openingRatio });
  while (history.length > 0 && timestampMs - history[0].timestampMs > 2500) history.shift();

  const rates: number[] = [];
  for (let index = 1; index < history.length; index += 1) {
    const previous = history[index - 1];
    const current = history[index];
    const elapsedSeconds = (current.timestampMs - previous.timestampMs) / 1000;
    if (elapsedSeconds > 0) rates.push(Math.abs(current.openingRatio - previous.openingRatio) / elapsedSeconds);
  }
  const movementPerSecond = rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : 0;
  return { openingImageNorm, widthImageNorm, openingRatio, movementPerSecond };
}

function validSlot0Frame(hand: readonly LiveLandmark[] | null | undefined): boolean {
  return Boolean(hand && hand.length === 21 && hand.every((point) => [point.x, point.y, point.z].every(Number.isFinite)));
}

export function useLiveLandmarker(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
) {
  const [status, setStatus] = useState<TrackerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LiveLandmarkerResult | null>(null);
  const [mouth, setMouth] = useState<MouthMotionMetrics | null>(null);
  const [prediction, setPrediction] = useState<HandFeaturesInferenceResponse | null>(null);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!enabled || !video) {
      setStatus('idle');
      setError(null);
      setResult(null);
      setMouth(null);
      setPrediction(null);
      setPredictionError(null);
      setIsClassifying(false);
      return;
    }

    let disposed = false;
    let initialized = false;
    let frameInFlight = false;
    let lastSentAt = -Infinity;
    let lastTimestamp = -1;
    let lastClassifiedAt = -Infinity;
    let animationFrame = 0;
    let disposeTimeout = 0;
    let initializationTimeout = 0;
    let classificationPending = false;
    const handWindow: Array<LiveLandmark[] | null> = [];
    const mouthHistory: Array<{ timestampMs: number; openingRatio: number }> = [];

    setStatus('initializing');
    setError(null);
    setResult(null);
    setMouth(null);
    setPrediction(null);
    setPredictionError(null);

    let worker: Worker;
    try {
      worker = new Worker('/liveLandmarker.worker.js');
    } catch {
      setStatus('error');
      setError('The browser could not start the local landmark worker.');
      return;
    }

    const stopWorker = () => {
      try {
        worker.postMessage({ type: 'dispose' } satisfies WorkerRequest);
        disposeTimeout = window.setTimeout(() => worker.terminate(), 500);
      } catch {
        worker.terminate();
      }
    };

    const sendFrame = (now: number) => {
      if (disposed) return;
      if (
        initialized &&
        !frameInFlight &&
        now - lastSentAt >= 120 &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 && video.videoHeight > 0
      ) {
        frameInFlight = true;
        lastSentAt = now;
        lastTimestamp = Math.max(lastTimestamp + 1, Math.round(now));
        const timestampMs = lastTimestamp;
        void createImageBitmap(video)
          .then((bitmap) => {
            if (disposed) {
              bitmap.close();
              frameInFlight = false;
              return;
            }
            worker.postMessage({ type: 'frame', bitmap, timestampMs } satisfies WorkerRequest, [bitmap]);
          })
          .catch(() => {
            frameInFlight = false;
            if (!disposed) {
              setStatus('error');
              setError('A live camera frame could not be prepared for local detection.');
            }
          });
      }
      animationFrame = window.requestAnimationFrame(sendFrame);
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === 'disposed') {
        worker.terminate();
        window.clearTimeout(disposeTimeout);
        return;
      }
      if (disposed) return;
      if (message.type === 'ready') {
        initialized = true;
        window.clearTimeout(initializationTimeout);
        setStatus('tracking');
        animationFrame = window.requestAnimationFrame(sendFrame);
        return;
      }
      if (message.type === 'error') {
        initialized = false;
        frameInFlight = false;
        window.cancelAnimationFrame(animationFrame);
        setStatus('error');
        setError(message.stage === 'initialization'
          ? 'Local hand or face tracker could not initialize. Check the model and WASM assets.'
          : 'Local landmark detection stopped after a frame-processing error.');
        return;
      }
      if (message.type !== 'result' || !message.hands || !message.faces || message.timestampMs === undefined) return;

      frameInFlight = false;
      const slot0 = message.hands[0] ?? null;
      handWindow.push(slot0);
      if (handWindow.length > 32) handWindow.shift();
      const validSlot0Frames = handWindow.filter(validSlot0Frame).length;
      setResult({
        timestampMs: message.timestampMs,
        hands: message.hands,
        faces: message.faces,
        handWindowFrames: handWindow.length,
        validSlot0Frames,
      });

      const face = message.faces[0];
      const currentMouth = mouthMetrics(face, message.timestampMs, mouthHistory);
      if (!face) mouthHistory.length = 0;
      setMouth(currentMouth);

      if (handWindow.length === 32 && validSlot0Frames >= 8 && !classificationPending && message.timestampMs - lastClassifiedAt >= 2200) {
        const features = computeSlot0HandFeatures(handWindow);
        if (features) {
          classificationPending = true;
          lastClassifiedAt = message.timestampMs;
          setIsClassifying(true);
          setPredictionError(null);
          void predictHandGestureFeatures(features)
            .then((response) => {
              if (!disposed) setPrediction(response);
            })
            .catch((reason: unknown) => {
              if (!disposed) {
                setPredictionError(reason instanceof Error ? reason.message : 'Hand classification could not be completed.');
              }
            })
            .finally(() => {
              classificationPending = false;
              if (!disposed) setIsClassifying(false);
            });
        }
      }
    };

    worker.onerror = () => {
      if (disposed) return;
      initialized = false;
      window.clearTimeout(initializationTimeout);
      window.cancelAnimationFrame(animationFrame);
      setStatus('error');
      setError('The local landmark worker stopped unexpectedly.');
      frameInFlight = false;
    };
    worker.postMessage({ type: 'init' } satisfies WorkerRequest);
    initializationTimeout = window.setTimeout(() => {
      if (disposed || initialized) return;
      initialized = false;
      worker.terminate();
      setStatus('error');
      setError('Local hand and face trackers took too long to initialize.');
    }, 30000);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(initializationTimeout);
      stopWorker();
    };
  }, [enabled, videoRef]);

  return { status, error, result, mouth, prediction, predictionError, isClassifying };
}
