import { logger } from '@/lib/logger'
import { NextApiRequest, NextApiResponse } from 'next'
import { withAccessPolicy } from '@/lib/accessPolicy/withAccessPolicy'
import { routePolicies } from '@/lib/accessPolicy/routePolicies'

// 感情表現を豊かにする追加指示を行うモデル、念の為リスト形式
const gpt4oEmotionalInstructionModels = ['gpt-4o']

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { message, voice, model, speed, apiKey, emotion } = req.body
  const stream = req.query.stream === 'true'
  const openaiKey =
    apiKey || process.env.OPENAI_TTS_KEY || process.env.OPENAI_API_KEY

  if (!message || !voice || !model || !openaiKey) {
    return res.status(400).json({ error: 'Missing required parameters' })
  }

  try {
    const options: Record<string, unknown> = {
      model: model,
      voice: voice,
      speed: speed,
      input: message,
      ...(stream ? { response_format: 'pcm' } : {}),
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

    if (stream) {
      if (!speechResponse.body) {
        return res.status(500).json({
          error: 'OpenAI TTS returned an empty stream',
          errorCode: 'OpenAITTSEmptyStream',
        })
      }

      res.writeHead(200, {
        'Content-Type': 'audio/pcm',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
        'X-Audio-Sample-Rate': '24000',
      })
      res.flushHeaders?.()

      const reader = speechResponse.body.getReader()
      let downstreamClosed = false
      const cancelUpstream = () => {
        downstreamClosed = true
        void reader.cancel('downstream closed').catch(() => {})
      }
      res.once('close', cancelUpstream)
      try {
        while (!downstreamClosed) {
          const { done, value } = await reader.read()
          if (done) break
          if (value?.byteLength) {
            res.write(Buffer.from(value))
          }
        }
      } finally {
        res.off('close', cancelUpstream)
        reader.releaseLock()
      }
      if (!downstreamClosed) res.end()
      return
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

export default withAccessPolicy(routePolicies['/api/openAITTS'], handler)
