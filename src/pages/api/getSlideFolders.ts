import { logger } from '@/lib/logger'
import fs from 'fs'
import path from 'path'
import { NextApiRequest, NextApiResponse } from 'next'
import { isRestrictedMode } from '@/utils/restrictedMode'
import assetManifest from '@/constants/assetManifest.json'
import { withAccessPolicy } from '@/lib/accessPolicy/withAccessPolicy'
import { routePolicies } from '@/lib/accessPolicy/routePolicies'

function handler(req: NextApiRequest, res: NextApiResponse) {
  if (isRestrictedMode()) {
    return res.status(200).json(assetManifest.slides.folders)
  }

  const slidesDir = path.join(process.cwd(), 'public', 'slides')

  try {
    const folders = fs
      .readdirSync(slidesDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .filter((dirent) => {
        const folderPath = path.join(slidesDir, dirent.name)
        const hasSlidesFile = fs.existsSync(path.join(folderPath, 'slides.md'))
        const hasScriptsFile = fs.existsSync(
          path.join(folderPath, 'scripts.json')
        )
        return hasSlidesFile && hasScriptsFile
      })
      .map((dirent) => dirent.name)

    res.status(200).json(folders)
  } catch (error) {
    logger.error('Error reading slides directory:', error)
    res.status(500).json({ error: 'Unable to read slides directory' })
  }
}

export default withAccessPolicy(routePolicies['/api/getSlideFolders'], handler)
