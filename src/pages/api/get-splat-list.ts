import type { NextApiRequest, NextApiResponse } from 'next'
import { readdirSync, statSync } from 'fs'
import { join, extname } from 'path'

const SPLATS_DIR = join(process.cwd(), 'public', 'splats')

const SPLAT_EXTENSIONS = ['.spz', '.ply', '.splat', '.ksplat', '.sog']

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const files: { name: string; size: number; url: string }[] = []
    const entries = readdirSync(SPLATS_DIR, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (SPLAT_EXTENSIONS.includes(ext)) {
          const fullPath = join(SPLATS_DIR, entry.name)
          const stat = statSync(fullPath)
          files.push({
            name: entry.name,
            size: stat.size,
            url: `/splats/${entry.name}`,
          })
        }
      }
    }

    res.status(200).json(files)
  } catch (error) {
    res.status(500).json({ error: 'Failed to list splat files' })
  }
}
