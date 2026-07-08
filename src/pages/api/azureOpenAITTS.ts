import { logger } from '@/lib/logger'
import { NextApiRequest, NextApiResponse } from 'next'
import { AzureOpenAI } from 'openai'
import { isHttpUrl } from '@/lib/api-services/serverUrlGuard'
import { withAccessPolicy } from '@/lib/accessPolicy/withAccessPolicy'
import { routePolicies } from '@/lib/accessPolicy/routePolicies'

// deploymentName はURLパス由来のため文字種を制限する（S13）
const DEPLOYMENT_NAME_PATTERN = /^[A-Za-z0-9._-]+$/

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { message, voice, speed, apiKey, endpoint } = req.body

  const azureTTSKey = apiKey || process.env.AZURE_TTS_KEY
  const azureTTSEndpoint = endpoint || process.env.AZURE_TTS_ENDPOINT

  if (!message || !voice || !speed || !azureTTSKey || !azureTTSEndpoint) {
    return res.status(400).json({ error: 'Missing required parameters' })
  }

  // endpoint はユーザー/環境変数由来のURLなので検証してからパースする（S13）
  let url: URL
  try {
    url = new URL(azureTTSEndpoint)
  } catch {
    return res.status(400).json({ error: 'Invalid Azure TTS endpoint URL' })
  }

  if (!isHttpUrl(url)) {
    return res.status(400).json({ error: 'Invalid Azure TTS endpoint URL' })
  }

  const pathParts = url.pathname.split('/')
  const deploymentName = pathParts.find((part) => part === 'deployments')
    ? pathParts[pathParts.indexOf('deployments') + 1]
    : 'tts'

  if (!deploymentName || !DEPLOYMENT_NAME_PATTERN.test(deploymentName)) {
    return res.status(400).json({ error: 'Invalid Azure TTS deployment name' })
  }

  try {
    const apiVersion =
      url.searchParams.get('api-version') || '2024-02-15-preview'

    const azureOpenAI = new AzureOpenAI({
      apiKey: azureTTSKey,
      endpoint: azureTTSEndpoint,
      apiVersion: apiVersion,
      deployment: deploymentName,
    })

    const mp3 = await azureOpenAI.audio.speech.create({
      model: deploymentName,
      voice: voice,
      input: message,
      speed: speed,
    })

    const buffer = Buffer.from(await mp3.arrayBuffer())

    res.setHeader('Content-Type', 'audio/mpeg')
    res.send(buffer)
  } catch (error) {
    logger.error('Azure OpenAI TTS error:', error)
    res.status(500).json({ error: 'Failed to generate speech' })
  }
}

export default withAccessPolicy(routePolicies['/api/azureOpenAITTS'], handler)
