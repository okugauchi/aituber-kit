import { logger } from '@/lib/logger'
import { NextApiRequest, NextApiResponse } from 'next'
import { pipeResponse } from '@/utils/pipeResponse'
import { withAccessPolicy } from '@/lib/accessPolicy/withAccessPolicy'
import { routePolicies } from '@/lib/accessPolicy/routePolicies'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { query, apiKey, url, conversationId, stream } = req.body

  const usesClientUrl = Boolean(url)
  const difyKey =
    apiKey ||
    (!usesClientUrl ? process.env.DIFY_KEY || process.env.DIFY_API_KEY : '')
  if (!difyKey) {
    return res
      .status(400)
      .json({ error: 'Dify Empty API Key', errorCode: 'EmptyAPIKey' })
  }
  const cleanUrl = (url: string) => {
    const trimmedUrl = url.replace(/\/$/, '')
    return trimmedUrl.endsWith('/chat-messages')
      ? trimmedUrl
      : `${trimmedUrl}/chat-messages`
  }

  const difyUrl = url
    ? cleanUrl(url)
    : process.env.DIFY_URL
      ? cleanUrl(process.env.DIFY_URL)
      : ''

  if (!difyUrl) {
    return res.status(400).json({
      error: 'Dify Empty URL',
      errorCode: 'AIInvalidProperty',
    })
  }

  const headers = {
    Authorization: `Bearer ${difyKey}`,
    'Content-Type': 'application/json',
  }
  const body = JSON.stringify({
    inputs: {},
    query: query,
    response_mode: stream ? 'streaming' : 'blocking',
    conversation_id: conversationId,
    user: 'aituber-kit',
    files: [],
  })

  try {
    const response = await fetch(difyUrl, {
      method: 'POST',
      headers: headers,
      body: body,
    })

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Dify API request failed',
        errorCode: 'AIAPIError',
      })
    }

    if (stream) {
      const streamResponse = new Response(response.body, {
        headers: { 'Content-Type': 'text/event-stream' },
      })
      return pipeResponse(streamResponse, res)
    } else {
      const data = await response.json()
      return res.status(200).json(data)
    }
  } catch (error) {
    logger.error('Error in Dify API call:', error)
    return res.status(500).json({
      error: 'Dify Internal Server Error',
      errorCode: 'AIAPIError',
    })
  }
}

export default withAccessPolicy(routePolicies['/api/difyChat'], handler)
