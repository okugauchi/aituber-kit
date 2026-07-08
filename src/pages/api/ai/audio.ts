import { logger } from '@/lib/logger'
import { NextApiRequest, NextApiResponse } from 'next'
import OpenAI from 'openai'
import {
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions'
import { defaultModels } from '@/features/constants/aiModels'
import { withAccessPolicy } from '@/lib/accessPolicy/withAccessPolicy'
import { routePolicies } from '@/lib/accessPolicy/routePolicies'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

/**
 * audioモード（chat.completions + modalities: ['text','audio']）のサーバー中継。
 *
 * クライアントがOpenAIを直接呼ぶ従来方式（dangerouslyAllowBrowser）を廃止し、
 * F1の統一アクセスポリシー配下でサーバー側キーを利用可能にする。
 * レスポンスはNDJSON（1行 = delta.audioの { transcript?, data?, id? }）。
 *
 * 設計ドキュメント: docs/audio-mode-auth-design.md
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { messages, apiKey, model, voice } = req.body

  // サーバー秘匿ガードは routePolicies の pairs 宣言により
  // withAccessPolicy がハンドラー実行前に評価済み
  const openaiKey =
    apiKey || process.env.OPENAI_KEY || process.env.OPENAI_API_KEY || ''

  if (!openaiKey) {
    return res
      .status(400)
      .json({ error: 'Empty API Key', errorCode: 'EmptyAPIKey' })
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: 'Invalid messages',
      errorCode: 'AIInvalidProperty',
    })
  }

  // クライアント切断時に上流のOpenAIリクエストを中断する（コスト保護）
  const upstreamAbort = new AbortController()
  res.once('close', () => upstreamAbort.abort())

  const openai = new OpenAI({ apiKey: openaiKey })

  const request: ChatCompletionCreateParamsStreaming = {
    model: model || defaultModels.openaiAudio,
    messages: messages as ChatCompletionMessageParam[],
    stream: true,
    modalities: ['text', 'audio'],
    audio: {
      voice: voice || 'alloy',
      format: 'pcm16',
    },
  }

  let stream
  try {
    stream = await openai.chat.completions.create(request, {
      signal: upstreamAbort.signal,
    })
  } catch (error) {
    logger.error('OpenAI Audio API error:', error)
    return res.status(500).json({
      error: 'Unexpected Error',
      errorCode: 'AIAPIError',
    })
  }

  res.status(200)
  res.setHeader('Content-Type', 'application/x-ndjson')
  res.setHeader('Cache-Control', 'no-cache')
  // 圧縮ミドルウェアによるバッファリングを防ぐ（pipeResponse.tsのSSE対応と同じ手法）
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // Cloudflare/OpenNextランタイムには flush が存在しないためoptional呼び出し
  const flush = (res as NextApiResponse & { flush?: () => void }).flush?.bind(
    res
  )

  try {
    for await (const chunk of stream) {
      const audio = (
        chunk.choices[0]?.delta as
          | { audio?: { transcript?: string; data?: string; id?: string } }
          | undefined
      )?.audio
      if (!audio) continue

      const payload: { transcript?: string; data?: string; id?: string } = {}
      if (audio.transcript) payload.transcript = audio.transcript
      if (audio.data) payload.data = audio.data
      if (audio.id) payload.id = audio.id
      if (Object.keys(payload).length === 0) continue

      res.write(JSON.stringify(payload) + '\n')
      flush?.()
    }
  } catch (error) {
    if (!upstreamAbort.signal.aborted) {
      logger.error('OpenAI Audio API stream error:', error)
    }
  } finally {
    res.end()
  }
}

export default withAccessPolicy(routePolicies['/api/ai/audio'], handler)
