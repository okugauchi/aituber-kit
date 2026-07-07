import { logger } from '@/lib/logger'
import type { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'
import { withAccessPolicy } from '@/lib/accessPolicy/withAccessPolicy'
import type { PolicyGate } from '@/lib/accessPolicy/withAccessPolicy'
import { routePolicies } from '@/lib/accessPolicy/routePolicies'

type Data = {
  audio?: ArrayBuffer
  error?: string
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>,
  gate: PolicyGate
) {
  const {
    text,
    speaker,
    speed,
    pitch,
    intonationScale,
    tempoDynamics = 1.0,
    prePhonemeLength = 0.1,
    postPhonemeLength = 0.1,
  } = req.body
  const apiUrl = gate.serverUrl!.raw

  try {
    // 1. Audio Query の生成
    const queryResponse = await axios.post(
      `${apiUrl}/audio_query?speaker=${speaker}&text=${encodeURIComponent(text)}`,
      null,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    )

    const queryData = queryResponse.data
    queryData.speedScale = speed
    queryData.pitchScale = pitch
    queryData.intonationScale = intonationScale
    queryData.tempoDynamicsScale = tempoDynamics
    queryData.prePhonemeLength = prePhonemeLength
    queryData.postPhonemeLength = postPhonemeLength

    // 2. 音声合成
    const synthesisResponse = await axios.post(
      `${apiUrl}/synthesis?speaker=${speaker}`,
      queryData,
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'audio/wav',
        },
        responseType: 'arraybuffer',
        timeout: 30000,
      }
    )

    res.setHeader('Content-Type', 'audio/wav')
    res.end(Buffer.from(synthesisResponse.data))
  } catch (error) {
    logger.error('Error in AivisSpeech TTS:', error)
    res.status(500).json({ error: 'Internal Server Error' })
  }
}

export default withAccessPolicy(routePolicies['/api/tts-aivisspeech'], handler)
