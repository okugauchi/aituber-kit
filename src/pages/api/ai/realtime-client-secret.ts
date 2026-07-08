import type { NextApiRequest, NextApiResponse } from 'next'
import { defaultModels } from '@/features/constants/aiModels'
import { routePolicies } from '@/lib/accessPolicy/routePolicies'
import { withAccessPolicy } from '@/lib/accessPolicy/withAccessPolicy'

type RequestBody = {
  apiKey?: string
  model?: string
}

type OpenAIRealtimeClientSecretResponse = {
  value?: string
  expires_at?: number
  session?: unknown
  error?: { message?: string }
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { apiKey, model } = req.body as RequestBody
  const openaiKey =
    apiKey || process.env.OPENAI_KEY || process.env.OPENAI_API_KEY || ''

  if (!openaiKey) {
    return res.status(400).json({
      error: 'Empty API Key',
      errorCode: 'EmptyAPIKey',
    })
  }

  const modelName =
    typeof model === 'string' && model ? model : defaultModels.openaiRealtime

  const response = await fetch(
    'https://api.openai.com/v1/realtime/client_secrets',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: modelName,
        },
      }),
    }
  )

  const data = (await response
    .json()
    .catch(() => ({}))) as OpenAIRealtimeClientSecretResponse

  if (!response.ok) {
    return res.status(response.status).json({
      error:
        data.error?.message || 'OpenAI Realtime client secret request failed',
      errorCode: 'OpenAIRealtimeClientSecretError',
    })
  }

  if (!data.value) {
    return res.status(502).json({
      error: 'OpenAI Realtime client secret response was empty',
      errorCode: 'OpenAIRealtimeClientSecretEmpty',
    })
  }

  return res.status(200).json({
    value: data.value,
    expires_at: data.expires_at,
    session: data.session,
  })
}

export default withAccessPolicy(
  routePolicies['/api/ai/realtime-client-secret'],
  handler
)
