/**
 * Game Commentary Mode Types
 *
 * Type definitions and constants for the game commentary feature
 */

// Game commentary settings interface
export interface GameCommentarySettings {
  gameCommentaryEnabled: boolean
  gameCommentaryPlaying: boolean // メインページのボタンで制御（YouTubeのyoutubePlayingと同じ）
  gameCommentaryCaptureInterval: number // 秒 (10-60)
  gameCommentaryContextCount: number // 実況履歴参照数 (1-20)
  gameCommentaryPromptTemplate: string
  gameCommentaryImageQuality: number // JPEG品質 (0.3-1.0)
  gameCommentaryResizeWidth: number // リサイズ幅px (0=なし)
  gameCommentarySaveToChat: boolean // chatLogにも保存するか（opt-in）
}

// Default configuration
export const DEFAULT_GAME_COMMENTARY_CONFIG: GameCommentarySettings = {
  gameCommentaryEnabled: false,
  gameCommentaryPlaying: false,
  gameCommentaryCaptureInterval: 15,
  gameCommentaryContextCount: 5,
  gameCommentaryPromptTemplate: '',
  gameCommentaryImageQuality: 0.7,
  gameCommentaryResizeWidth: 1024,
  gameCommentarySaveToChat: true,
}

// Interval validation constants
export const GAME_COMMENTARY_INTERVAL = { MIN: 10, MAX: 60 }

// Context count validation constants
export const GAME_COMMENTARY_CONTEXT_COUNT = { MIN: 1, MAX: 20 }

// Validate and clamp capture interval value
export function clampCaptureInterval(value: number): number {
  if (value < GAME_COMMENTARY_INTERVAL.MIN) return GAME_COMMENTARY_INTERVAL.MIN
  if (value > GAME_COMMENTARY_INTERVAL.MAX) return GAME_COMMENTARY_INTERVAL.MAX
  return value
}

// Validate and clamp context count value
export function clampContextCount(value: number): number {
  if (value < GAME_COMMENTARY_CONTEXT_COUNT.MIN)
    return GAME_COMMENTARY_CONTEXT_COUNT.MIN
  if (value > GAME_COMMENTARY_CONTEXT_COUNT.MAX)
    return GAME_COMMENTARY_CONTEXT_COUNT.MAX
  return value
}
