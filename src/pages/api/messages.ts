import { NextApiRequest, NextApiResponse } from 'next'
import {
  MessageType,
  cleanupClientQueues,
  dequeueMessages,
  enqueueMessages,
} from '@/features/api/messageGateway'
import { normalizeImage } from '@/features/api/http'
import { withAccessPolicy } from '@/lib/accessPolicy/withAccessPolicy'
import { routePolicies } from '@/lib/accessPolicy/routePolicies'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

const handler = (req: NextApiRequest, res: NextApiResponse) => {
  const clientId = req.query.clientId as string
  const type = (req.query.type as MessageType) || 'direct_send'
  const allowedTypes: MessageType[] = [
    'direct_send',
    'ai_generate',
    'user_input',
  ]

  if (!clientId) {
    res.status(400).json({ error: 'Client ID is required' })
    return
  }

  if (req.method === 'POST') {
    const { messages, systemPrompt, useCurrentSystemPrompt, image } = req.body

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Messages array is required' })
      return
    }
    if (systemPrompt && typeof systemPrompt !== 'string') {
      res.status(400).json({ error: 'System prompt is not a string' })
      return
    }
    if (useCurrentSystemPrompt && typeof useCurrentSystemPrompt !== 'boolean') {
      res.status(400).json({ error: 'useCurrentSystemPrompt is not a boolean' })
      return
    }
    const imageResult = normalizeImage(image)
    if (!imageResult.ok) {
      res.status(imageResult.status).json({ error: imageResult.error })
      return
    }

    cleanupClientQueues()

    if (!allowedTypes.includes(type)) {
      res.status(400).json({ error: 'Invalid type' })
      return
    }

    enqueueMessages({
      clientId,
      messages,
      type,
      systemPrompt,
      useCurrentSystemPrompt,
      image: imageResult.image,
      source: 'legacy',
    })

    res.status(201).json({ message: 'Successfully sent' })
  } else {
    const newMessages = dequeueMessages(clientId)

    res.status(200).json({ messages: newMessages })
  }
}

export default withAccessPolicy(routePolicies['/api/messages'], handler)
