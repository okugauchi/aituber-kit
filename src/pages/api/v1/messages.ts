import type { NextApiRequest, NextApiResponse } from 'next'
import {
  enqueueMessages,
  enqueueStopCommand,
  MessageType,
} from '@/features/api/messageGateway'
import {
  getClientIdFromRequest,
  normalizeImage,
  normalizeMessages,
  requireApiKey,
  sendMethodNotAllowed,
} from '@/features/api/http'
import {
  isRestrictedMode,
  createRestrictedModeErrorResponse,
} from '@/utils/restrictedMode'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

const allowedTypes: MessageType[] = ['direct_send', 'ai_generate', 'user_input']

const normalizeMessageType = (value: unknown): MessageType | null => {
  return allowedTypes.includes(value as MessageType)
    ? (value as MessageType)
    : null
}

const handler = (req: NextApiRequest, res: NextApiResponse) => {
  if (isRestrictedMode()) {
    return res
      .status(403)
      .json(createRestrictedModeErrorResponse('v1/messages'))
  }

  if (req.method !== 'POST') {
    return sendMethodNotAllowed(res)
  }

  if (!requireApiKey(req, res)) return

  const clientId = getClientIdFromRequest(req, req.body?.clientId)
  if (!clientId) {
    return res.status(400).json({ error: 'Client ID is required' })
  }

  const rawType = req.body?.type ?? req.query.type ?? 'direct_send'
  const type = normalizeMessageType(rawType)
  if (!type) {
    return res.status(400).json({ error: 'Invalid type' })
  }

  const messages = normalizeMessages(req.body?.messages ?? req.body?.text)
  if (messages.length === 0) {
    return res.status(400).json({ error: 'Text or messages are required' })
  }

  if (
    req.body?.systemPrompt !== undefined &&
    typeof req.body.systemPrompt !== 'string'
  ) {
    return res.status(400).json({ error: 'System prompt is not a string' })
  }

  if (
    req.body?.useCurrentSystemPrompt !== undefined &&
    typeof req.body.useCurrentSystemPrompt !== 'boolean'
  ) {
    return res
      .status(400)
      .json({ error: 'useCurrentSystemPrompt is not a boolean' })
  }

  const imageResult = normalizeImage(req.body?.image)
  if (!imageResult.ok) {
    return res.status(imageResult.status).json({ error: imageResult.error })
  }

  const interrupt = req.body?.interrupt === true
  if (interrupt) {
    enqueueStopCommand(clientId, 'all', 'interrupt_before_messages')
  }

  const useCurrentSystemPrompt =
    typeof req.body?.useCurrentSystemPrompt === 'boolean'
      ? req.body.useCurrentSystemPrompt
      : true

  const queuedMessages = enqueueMessages({
    clientId,
    messages,
    type,
    systemPrompt:
      type === 'ai_generate' && !useCurrentSystemPrompt
        ? req.body?.systemPrompt
        : undefined,
    useCurrentSystemPrompt:
      type === 'ai_generate' ? useCurrentSystemPrompt : undefined,
    image: imageResult.image,
    emotion:
      type === 'direct_send' && typeof req.body?.emotion === 'string'
        ? req.body.emotion
        : undefined,
    priority: req.body?.priority === 'high' ? 'high' : 'normal',
    interrupt,
    source: 'v1',
  })

  return res.status(202).json({
    ok: true,
    clientId,
    type,
    queued: queuedMessages.map((message) => message.id),
    count: queuedMessages.length,
  })
}

export default handler
