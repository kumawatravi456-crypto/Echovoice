/**
 * Browser-side port of the seven reviewed slot-0 static features.
 * Coordinates follow the training convention: subtract wrist (0), then divide
 * by the 3D wrist-to-middle-MCP (9) distance before computing geometry.
 */
export const LIVE_HAND_FEATURE_COLUMNS = [
  'slot0_thumb_joint2_angle_deg_mean',
  'slot0_index_joint1_angle_deg_mean',
  'slot0_pinky_joint2_angle_deg_mean',
  'slot0_index_extension_ratio_mean',
  'slot0_thumb_tip_to_palm_center_distance_norm_mean',
  'slot0_index_tip_to_wrist_distance_norm_mean',
  'slot0_palm_projected_area_norm2_mean',
] as const;

export type LiveHandFeatureColumn = (typeof LIVE_HAND_FEATURE_COLUMNS)[number];
export type LiveHandFeatureVector = Record<LiveHandFeatureColumn, number>;

export interface LiveLandmark {
  x: number;
  y: number;
  z: number;
}

type Point = readonly [number, number, number];
type FrameFeatures = Partial<LiveHandFeatureVector>;

const PALM_POINTS = [0, 5, 9, 13, 17] as const;

function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function angleDegrees(a: Point, b: Point, c: Point): number | null {
  const first: Point = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const second: Point = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
  const firstLength = Math.hypot(...first);
  const secondLength = Math.hypot(...second);
  if (!Number.isFinite(firstLength) || !Number.isFinite(secondLength) || firstLength <= 0 || secondLength <= 0) {
    return null;
  }
  const cosine = (first[0] * second[0] + first[1] * second[1] + first[2] * second[2]) /
    (firstLength * secondLength);
  if (!Number.isFinite(cosine)) return null;
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * (180 / Math.PI);
}

function normalizeLandmarks(points: readonly LiveLandmark[]): Point[] | null {
  if (points.length !== 21 || points.some(({ x, y, z }) => ![x, y, z].every(Number.isFinite))) {
    return null;
  }
  const wrist = points[0];
  const middleMcp = points[9];
  const scale = Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y, middleMcp.z - wrist.z);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  return points.map(({ x, y, z }) => [
    (x - wrist.x) / scale,
    (y - wrist.y) / scale,
    (z - wrist.z) / scale,
  ]);
}

function polygonAreaXY(points: readonly Point[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current[0] * next[1] - current[1] * next[0];
  }
  return Math.abs(twiceArea) / 2;
}

function frameFeatures(points: readonly Point[]): FrameFeatures {
  const thumbAngle = angleDegrees(points[1], points[2], points[3]);
  const indexAngle = angleDegrees(points[0], points[5], points[6]);
  const pinkyAngle = angleDegrees(points[17], points[18], points[19]);

  const indexSegments = distance(points[5], points[6]) + distance(points[6], points[7]) + distance(points[7], points[8]);
  const indexChord = distance(points[5], points[8]);
  const palmCenter: Point = [
    PALM_POINTS.reduce<number>((sum, landmark) => sum + points[landmark][0], 0) / PALM_POINTS.length,
    PALM_POINTS.reduce<number>((sum, landmark) => sum + points[landmark][1], 0) / PALM_POINTS.length,
    PALM_POINTS.reduce<number>((sum, landmark) => sum + points[landmark][2], 0) / PALM_POINTS.length,
  ];
  const extensionRatio = indexSegments > 0 && Number.isFinite(indexSegments)
    ? Math.max(0, Math.min(1, indexChord / indexSegments))
    : null;

  return {
    slot0_thumb_joint2_angle_deg_mean: thumbAngle ?? undefined,
    slot0_index_joint1_angle_deg_mean: indexAngle ?? undefined,
    slot0_pinky_joint2_angle_deg_mean: pinkyAngle ?? undefined,
    slot0_index_extension_ratio_mean: extensionRatio ?? undefined,
    slot0_thumb_tip_to_palm_center_distance_norm_mean: distance(points[4], palmCenter),
    slot0_index_tip_to_wrist_distance_norm_mean: distance(points[8], points[0]),
    slot0_palm_projected_area_norm2_mean: polygonAreaXY(PALM_POINTS.map((index) => points[index])),
  };
}

/** Aggregate per-frame static geometry over a 32-frame live window. */
export function computeSlot0HandFeatures(
  frames: readonly (readonly LiveLandmark[] | null)[],
): LiveHandFeatureVector | null {
  if (frames.length !== 32) return null;

  const observations: FrameFeatures[] = [];
  for (const frame of frames) {
    if (!frame) continue;
    const normalized = normalizeLandmarks(frame);
    if (normalized) observations.push(frameFeatures(normalized));
  }
  if (observations.length < 8) return null;

  const values = {} as LiveHandFeatureVector;
  for (const feature of LIVE_HAND_FEATURE_COLUMNS) {
    const finiteValues = observations
      .map((observation) => observation[feature])
      .filter((value): value is number => value !== undefined && Number.isFinite(value));
    if (finiteValues.length === 0) return null;
    values[feature] = finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
  }
  return values;
}
