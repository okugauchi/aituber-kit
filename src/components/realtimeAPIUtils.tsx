import { AudioBufferManager } from '@/utils/audioBufferManager'

// 型定義
export interface TmpMessage {
  text: string
  role: string
  emotion: string
  type: string
  buffer?: ArrayBuffer
}

export interface Params {
  handleReceiveTextFromRt: (
    text: string,
    role?: string,
    type?: string,
    buffer?: ArrayBuffer
  ) => Promise<void>
}

// Realtime APIのfunction callingツール定義（realtimeAPITools.jsonの形式）
export interface RealtimeAPIToolDefinition {
  type: string
  name: string
  description: string
  parameters: {
    type: string
    properties: Record<string, { type: string; description: string }>
    required: string[]
  }
}

// セッション設定用の型定義
export interface SessionConfig {
  type: string
  session: {
    type: 'realtime'
    output_modalities: string[]
    instructions: string
    audio: {
      input: {
        format: {
          type: 'audio/pcm'
          rate: number
        }
        transcription: {
          model: string
        }
        turn_detection: null
      }
      output: {
        format: {
          type: 'audio/pcm'
          rate: number
        }
        voice: string
      }
    }
    tools?: RealtimeAPIToolDefinition[]
    tool_choice?: string
  }
}

// ユーティリティ関数
export function mergeInt16Arrays(
  left: Int16Array | ArrayBuffer,
  right: Int16Array | ArrayBuffer
): Int16Array {
  if (left instanceof ArrayBuffer) {
    left = new Int16Array(left)
  }
  if (right instanceof ArrayBuffer) {
    right = new Int16Array(right)
  }
  if (!(left instanceof Int16Array) || !(right instanceof Int16Array)) {
    throw new Error(`Both items must be Int16Array`)
  }
  const newValues = new Int16Array(left.length + right.length)
  newValues.set(left, 0)
  newValues.set(right, left.length)
  return newValues
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}
