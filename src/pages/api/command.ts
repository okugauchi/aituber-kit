/**
 * Generic command API endpoint for the EJ (Emote Jockey) Controller.
 *
 * POST: Enqueue a command (pose, splat, setting, chat-reset, stop)
 * GET:  Dequeue pending commands for a given clientId (used by commandExecutor on main page)
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import {
  enqueueCommand,
  enqueueStopCommand,
  dequeueCommands,
} from '@/features/api/messageGateway'
import { getClientIdFromRequest } from '@/features/api/http'
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
  mode?: 'speech' | 'queue' | 'all'
  reason?: string
  poseId?: string
  splatAction?: string
  splatArgs?: Record<string, unknown>
  settingKey?: string
  settingValue?: unknown
}

const handler = (req: NextApiRequest, res: NextApiResponse) => {
  // ─── GET: dequeue commands ──────────────────────────────────────────
  if (req.method === 'GET') {
    const clientId = getClientIdFromRequest(req)
    if (!clientId) {
      return res.status(400).json({ error: 'Client ID is required' })
    }
    const commands = dequeueCommands(clientId)
    return res.status(200).json({ commands })
  }

  // ─── POST: enqueue command ──────────────────────────────────────────
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
