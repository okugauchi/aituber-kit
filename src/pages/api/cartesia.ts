import type { NextApiRequest, NextApiResponse } from 'next'
import { withAccessPolicy } from '@/lib/accessPolicy/withAccessPolicy'
import { routePolicies } from '@/lib/accessPolicy/routePolicies'

type Data = {
  audio?: Buffer
  error?: string
  errorCode?: string
}

async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  const body = req.body
  const message = body.message
  const voiceId = body.voiceId || process.env.CARTESIA_VOICE_ID
  const apiKey = body.apiKey || process.env.CARTESIA_API_KEY
  const language = body.language

  if (!apiKey) {
    res.status(400).json({ error: 'Empty API Key', errorCode: 'EmptyAPIKey' })
    return
  }
  if (!voiceId) {
    res
      .status(400)
      .json({ error: 'Empty Voice ID', errorCode: 'EMPTY_PROPERTY' })
    return
  }

  try {
    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Cartesia-Version': '2025-04-16',
      },
      body: JSON.stringify({
        model_id: 'sonic-turbo',
        transcript: message,
        voice: {
          mode: 'id',
          id: voiceId,
        },
        output_format: {
          container: 'wav',
          encoding: 'pcm_f32le',
          sample_rate: 44100,
        },
        language: language,
      }),
    })

    if (!response.ok) {
      throw new Error(
        `Cartesia APIからの応答が異常です。ステータスコード: ${response.status}`
      )
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    res.writeHead(200, {
      'Content-Type': 'audio/wav',
      'Content-Length': buffer.length,
    })
    res.end(buffer)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export default withAccessPolicy(routePolicies['/api/cartesia'], handler)
