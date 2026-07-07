/**
 * PNGTuberEngine用の純粋関数群
 * 決定的・副作用なしの計算ロジック（アフィン行列計算、キャリブレーション、
 * 色変換、口形状選択、閾値計算）をエンジンから分離したもの
 */

import {
  MouthState,
  MouthTrackData,
  MouthSpriteUrls,
  VolumeThresholds,
  AffineMatrix,
} from './pngTuberTypes'

/**
 * 感度から閾値を計算
 * @param sensitivity 感度（0-100）
 */
export function getVolumeThresholds(sensitivity: number): VolumeThresholds {
  const s = sensitivity / 100
  const closed = 0.008 + (1 - s) * 0.018
  const half = 0.02 + (1 - s) * 0.06
  return { closed, half }
}

/**
 * HQ Audio用の閾値を計算
 * @param sensitivity 感度（0-100）
 */
export function getVolumeThresholdsHQ(sensitivity: number): VolumeThresholds {
  const s = sensitivity / 100
  const closed = 0.07 + (1 - s) * 0.08
  const half = 0.22 + (1 - s) * 0.12
  return { closed, half }
}

/**
 * 口の状態を選択
 */
export function selectMouthState(
  volume: number,
  highRatio: number,
  thresholds: VolumeThresholds,
  spriteUrls: Partial<MouthSpriteUrls>
): MouthState {
  if (volume < thresholds.closed) return 'closed'
  if (volume < thresholds.half) return spriteUrls.half ? 'half' : 'open'

  if (highRatio > 0.62 && spriteUrls.e) return 'e'
  if (highRatio < 0.38 && spriteUrls.u) return 'u'
  return 'open'
}

/**
 * HQ Audio用の口状態選択（ヒステリシス付き）
 * 口の開閉に異なる閾値を使用してチャタリングを防止
 */
export function selectMouthStateHQ(
  level: number,
  highRatio: number,
  thresholds: VolumeThresholds,
  currentState: MouthState,
  spriteUrls: Partial<MouthSpriteUrls>
): MouthState {
  const hasHalf = !!spriteUrls.half
  const hasE = !!spriteUrls.e
  const hasU = !!spriteUrls.u

  // ヒステリシス用の閾値
  const closeTh = Math.max(0.02, thresholds.closed - 0.03)
  const halfDownTh = Math.max(closeTh + 0.02, thresholds.half - 0.02)

  // 現在の状態をベースに判定
  let state: MouthState = currentState
  if (state === 'e' || state === 'u') {
    state = 'open'
  }

  // 状態遷移の判定
  if (state === 'closed') {
    if (level >= thresholds.half) {
      state = 'open'
    } else if (level >= thresholds.closed && hasHalf) {
      state = 'half'
    } else if (level >= thresholds.closed) {
      state = 'open'
    } else {
      state = 'closed'
    }
  } else if (state === 'half') {
    if (level < closeTh) {
      state = 'closed'
    } else if (level >= thresholds.half) {
      state = 'open'
    } else {
      state = 'half'
    }
  } else {
    // state === 'open'
    if (level < closeTh) {
      state = 'closed'
    } else if (level < halfDownTh && hasHalf) {
      state = 'half'
    } else {
      state = 'open'
    }
  }

  // 開いた状態の場合、周波数で母音を判定
  if (state === 'open') {
    if (highRatio > 0.62 && hasE) return 'e'
    if (highRatio < 0.38 && hasU) return 'u'
  }
  return state
}

/**
 * 16進数カラーコードをRGBに変換
 */
export function hexToRGB(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (result) {
    return [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16),
    ]
  }
  return [0, 255, 0] // デフォルトはグリーン
}

/**
 * キャリブレーションを適用
 */
export function applyCalibrationToQuad(
  quad: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ],
  data: MouthTrackData
): [number, number][] {
  const calib = data.calibration || { offset: [0, 0], scale: 1, rotation: 0 }
  const applyCalib = data.calibrationApplied === true
  if (!applyCalib) {
    return quad.map((pt) => [pt[0], pt[1]] as [number, number])
  }

  const offsetX = calib.offset[0] || 0
  const offsetY = calib.offset[1] || 0
  const scale = calib.scale || 1
  const rotation = ((calib.rotation || 0) * Math.PI) / 180

  let cx = 0
  let cy = 0
  for (const [x, y] of quad) {
    cx += x
    cy += y
  }
  cx /= 4
  cy /= 4

  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  return quad.map(([x, y]) => {
    const dx = (x - cx) * scale
    const dy = (y - cy) * scale
    const rx = dx * cos - dy * sin + cx + offsetX
    const ry = dx * sin + dy * cos + cy + offsetY
    return [rx, ry] as [number, number]
  })
}

/**
 * アフィン変換行列を計算
 */
export function computeAffine(
  s0: [number, number],
  s1: [number, number],
  s2: [number, number],
  d0: [number, number],
  d1: [number, number],
  d2: [number, number]
): AffineMatrix | null {
  const [sx0, sy0] = s0
  const [sx1, sy1] = s1
  const [sx2, sy2] = s2

  const [dx0, dy0] = d0
  const [dx1, dy1] = d1
  const [dx2, dy2] = d2

  const denom = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1)
  if (denom === 0) return null

  const a = (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) / denom
  const b = (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) / denom
  const c = (dx0 * (sx2 - sx1) + dx1 * (sx0 - sx2) + dx2 * (sx1 - sx0)) / denom
  const d = (dy0 * (sx2 - sx1) + dy1 * (sx0 - sx2) + dy2 * (sx1 - sx0)) / denom
  const e =
    (dx0 * (sx1 * sy2 - sx2 * sy1) +
      dx1 * (sx2 * sy0 - sx0 * sy2) +
      dx2 * (sx0 * sy1 - sx1 * sy0)) /
    denom
  const f =
    (dy0 * (sx1 * sy2 - sx2 * sy1) +
      dy1 * (sx2 * sy0 - sx0 * sy2) +
      dy2 * (sx0 * sy1 - sx1 * sy0)) /
    denom

  return { a, b, c, d, e, f }
}
