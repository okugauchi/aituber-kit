/**
 * Generic command API endpoint for the EJ (Emote Jockey) Controller.
 * Accepts commands for pose, splat, setting, chat-reset, and stop.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import {
  enqueueCommand,
  enqueueStopCommand,
} from '@/features/api/messageGateway'
import { withAccessPolicy } from '@/lib/accessPolicy/withAccessPolicy'
import { routePolicies } from '@/lib/accessPolicy/routePolicies'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10kb',
    },
  },
}

type CommandBody = {
  clientId?: string
  command: 'pose' | 'splat' | 'setting' | 'chat-reset' | 'stop'
  /** For stop command */
  mode?: 'speech' | 'queue' | 'all'
  reason?: string
  /** For pose command */
  poseId?: string
  /** For splat command */
  splatAction?: string
  splatArgs?: Record<string, unknown>
  /** For setting command */
  settingKey?: string
  settingValue?: unknown
}

const handler = (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = req.body as CommandBody
  const clientId = body.clientId || 'default'

  switch (body.command) {
    case 'stop': {
      enqueueStopCommand(clientId, body.mode || 'all', body.reason)
      return res.status(200).json({ ok: true, command: 'stop' })
    }

    case 'pose': {
      if (!body.poseId) {
        return res.status(400).json({ error: 'poseId is required' })
      }
      enqueueCommand({
        clientId,
        command: 'pose',
        pose: { poseId: body.poseId },
      })
      return res
        .status(200)
        .json({ ok: true, command: 'pose', poseId: body.poseId })
    }

    case 'splat': {
      if (!body.splatAction) {
        return res.status(400).json({ error: 'splatAction is required' })
      }
      enqueueCommand({
        clientId,
        command: 'splat',
        splat: { action: body.splatAction, args: body.splatArgs },
      })
      return res.status(200).json({
        ok: true,
        command: 'splat',
        action: body.splatAction,
      })
    }

    case 'setting': {
      if (!body.settingKey) {
        return res.status(400).json({ error: 'settingKey is required' })
      }
      enqueueCommand({
        clientId,
        command: 'setting',
        setting: { key: body.settingKey, value: body.settingValue },
      })
      return res.status(200).json({
        ok: true,
        command: 'setting',
        key: body.settingKey,
      })
    }

    case 'chat-reset': {
      enqueueCommand({
        clientId,
        command: 'chat-reset',
      })
      return res.status(200).json({ ok: true, command: 'chat-reset' })
    }

    default:
      return res.status(400).json({ error: `Unknown command: ${body.command}` })
  }
}

export default withAccessPolicy(routePolicies['/api/command'], handler)
