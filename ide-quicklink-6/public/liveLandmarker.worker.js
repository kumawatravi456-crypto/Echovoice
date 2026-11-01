/* Classic worker: MediaPipe's WASM loader uses importScripts(). */
importScripts('/mediapipe/vision_bundle.js');

let handLandmarker = null;
let faceLandmarker = null;

function copyLandmarks(groups) {
  return groups.map((group) => group.map(({ x, y, z }) => ({ x, y, z })));
}

async function initialize() {
  const wasmRoot = new URL('/mediapipe/wasm/', self.location.origin).href;
  const vision = await self.Vision.FilesetResolver.forVisionTasks(wasmRoot);
  const handModel = new URL('/models/hand_landmarker.task', self.location.origin).href;
  const faceModel = new URL('/models/face_landmarker.task', self.location.origin).href;

  handLandmarker = await self.Vision.HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: handModel, delegate: 'CPU' },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  faceLandmarker = await self.Vision.FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: faceModel, delegate: 'CPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

self.onmessage = async (event) => {
  const request = event.data;
  if (request.type === 'init') {
    try {
      await initialize();
      self.postMessage({ type: 'ready' });
    } catch {
      self.postMessage({ type: 'error', stage: 'initialization' });
    }
    return;
  }

  if (request.type === 'dispose') {
    handLandmarker?.close();
    faceLandmarker?.close();
    handLandmarker = null;
    faceLandmarker = null;
    self.postMessage({ type: 'disposed' });
    return;
  }

  try {
    if (!handLandmarker || !faceLandmarker) throw new Error('not initialized');
    const handResult = handLandmarker.detectForVideo(request.bitmap, request.timestampMs);
    const faceResult = faceLandmarker.detectForVideo(request.bitmap, request.timestampMs);
    self.postMessage({
      type: 'result',
      timestampMs: request.timestampMs,
      hands: copyLandmarks(handResult.landmarks),
      faces: copyLandmarks(faceResult.faceLandmarks),
    });
  } catch {
    self.postMessage({ type: 'error', stage: 'detection' });
  } finally {
    request.bitmap.close();
  }
};
