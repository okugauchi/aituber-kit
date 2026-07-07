import { logger } from '@/lib/logger'
import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs/promises'
import path from 'path'
import { withAccessPolicy } from '@/lib/accessPolicy/withAccessPolicy'
import { routePolicies } from '@/lib/accessPolicy/routePolicies'
import { validateSpeakersResponse } from '@/lib/api-services/validateSpeakersResponse'

interface VoicevoxSpeaker {
  speaker: string
  id: number
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // APIからデータを取得
    const rawServerUrl = Array.isArray(req.query.serverUrl)
      ? req.query.serverUrl[0]
      : req.query.serverUrl
    const serverUrl =
      rawServerUrl ||
      process.env.VOICEVOX_SERVER_URL ||
      'http://localhost:50021'
    const parsedUrl = new URL(serverUrl)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Invalid server URL protocol' })
    }
    const response = await fetch(`${serverUrl}/speakers`)
    const speakers = await validateSpeakersResponse(response, 'VOICEVOX')

    // VOICEVOX形式に変換
    const voicevoxSpeakers: VoicevoxSpeaker[] = speakers.flatMap((speaker) =>
      speaker.styles.map((style) => ({
        speaker: `${speaker.name}/${style.name}`,
        id: style.id,
      }))
    )

    // JSONファイルに書き込み
    const filePath = path.join(process.cwd(), 'public/speakers.json')
    await fs.writeFile(
      filePath,
      JSON.stringify(voicevoxSpeakers, null, 2) + '\n'
    )

    res.status(200).json({ message: 'Speakers file updated successfully' })
  } catch (error) {
    logger.error('Error updating VOICEVOX speakers:', error)
    res.status(500).json({ error: 'Failed to update VOICEVOX speakers file' })
  }
}

export default withAccessPolicy(
  routePolicies['/api/update-voicevox-speakers'],
  handler
)
