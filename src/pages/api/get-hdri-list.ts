import type { NextApiRequest, NextApiResponse } from 'next'
import { readdirSync, statSync } from 'fs'
import { join, extname } from 'path'

const HDRI_DIR = join(process.cwd(), 'public', 'hdri')

const HDRI_EXTENSIONS = ['.hdr', '.exr', '.jpg', '.jpeg', '.png']

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const files: { name: string; size: number; url: string }[] = []
    const entries = readdirSync(HDRI_DIR, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (HDRI_EXTENSIONS.includes(ext)) {
          const fullPath = join(HDRI_DIR, entry.name)
          const stat = statSync(fullPath)
          files.push({
            name: entry.name,
            size: stat.size,
            url: `/hdri/${entry.name}`,
          })
        }
      }
    }

    res.status(200).json(files)
  } catch (error) {
    res.status(200).json([])
  }
}
