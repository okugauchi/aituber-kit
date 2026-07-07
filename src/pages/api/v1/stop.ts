import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiStopMode, enqueueStopCommand } from '@/features/api/messageGateway'
import { getClientIdFromRequest } from '@/features/api/http'
import { withAccessPolicy } from '@/lib/accessPolicy/withAccessPolicy'
import { routePolicies } from '@/lib/accessPolicy/routePolicies'

const normalizeStopMode = (mode: unknown): ApiStopMode => {
  if (mode === 'speech' || mode === 'queue' || mode === 'all') return mode
  return 'all'
}

const handler = (req: NextApiRequest, res: NextApiResponse) => {
  const clientId = getClientIdFromRequest(req, req.body?.clientId)
  if (!clientId) {
    return res.status(400).json({ error: 'Client ID is required' })
  }

  const command = enqueueStopCommand(
    clientId,
    normalizeStopMode(req.body?.mode),
    typeof req.body?.reason === 'string' ? req.body.reason : undefined
  )

  return res.status(202).json({
    ok: true,
    clientId,
    commandId: command.id,
    mode: command.mode,
  })
}

export default withAccessPolicy(routePolicies['/api/v1/stop'], handler)
