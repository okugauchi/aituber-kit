import { logger } from '@/lib/logger'
import { NextApiRequest, NextApiResponse } from 'next'
import { guardServerSecretAccess } from '@/lib/api-services/serverSecretGuard'

// 感情表現を豊かにする追加指示を行うモデル、念の為リスト形式
const gpt4oEmotionalInstructionModels = ['gpt-4o']

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { message, voice, model, speed, apiKey, emotion } = req.body
  const openaiKey =
    apiKey || process.env.OPENAI_TTS_KEY || process.env.OPENAI_API_KEY
  const usesServerSecret =
    !apiKey && Boolean(process.env.OPENAI_TTS_KEY || process.env.OPENAI_API_KEY)

  if (!message || !voice || !model || !openaiKey) {
    return res.status(400).json({ error: 'Missing required parameters' })
  }

  if (
    usesServerSecret &&
    !guardServerSecretAccess(req, res, { featureName: 'openAITTS' })
  ) {
    return
  }

  try {
    const options: Record<string, unknown> = {
      model: model,
      voice: voice,
      speed: speed,
      input: message,
    }

    if (gpt4oEmotionalInstructionModels.some((m) => model.includes(m))) {
      options.instructions = `Please speak "${message}" with rich emotional expression.`
    }

    const speechResponse = await fetch(
      'https://api.openai.com/v1/audio/speech',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      }
    )

    if (!speechResponse.ok) {
      const errorText = await speechResponse.text()
      logger.error('OpenAI TTS upstream error:', {
        status: speechResponse.status,
        body: errorText,
      })
      return res.status(500).json({
        error: 'Failed to generate speech',
        errorCode: 'OpenAITTSUpstreamError',
        status: speechResponse.status,
      })
    }

    const buffer = Buffer.from(await speechResponse.arrayBuffer())

    res.setHeader(
      'Content-Type',
      speechResponse.headers.get('content-type') || 'audio/mpeg'
    )
    res.send(buffer)
  } catch (error) {
    logger.error('OpenAI TTS error:', error)
    res.status(500).json({ error: 'Failed to generate speech' })
  }
}
