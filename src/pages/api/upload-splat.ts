import { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import fs from 'fs'
import path from 'path'
import { withAccessPolicy } from '@/lib/accessPolicy/withAccessPolicy'
import { routePolicies } from '@/lib/accessPolicy/routePolicies'

export const config = {
  api: {
    bodyParser: false,
  },
}

const SPLAT_EXTENSIONS = ['.spz', '.ply', '.splat', '.ksplat', '.sog']

const formOptions: formidable.Options = {
  maxFileSize: 500 * 1024 * 1024, // 500MB (3DGS files can be large)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const form = formidable(formOptions)

  try {
    const [fields, files] = await form.parse(req)
    const file = files.file?.[0]

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const extension = path.extname(file.originalFilename || '').toLowerCase()
    if (!SPLAT_EXTENSIONS.includes(extension)) {
      return res.status(400).json({
        error: 'Invalid file type',
        message:
          'Only .spz, .ply, .splat, .ksplat, and .sog files are accepted',
      })
    }

    const splatDir = path.join(process.cwd(), 'public/splats')
    if (!fs.existsSync(splatDir)) {
      fs.mkdirSync(splatDir, { recursive: true })
    }

    const filename = file.originalFilename || 'splat' + extension
    const newPath = path.join(splatDir, filename)
    await fs.promises.copyFile(file.filepath, newPath)

    res.status(200).json({
      path: `/splats/${filename}`,
      name: filename,
      size: file.size,
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload splat file' })
  }
}

export default withAccessPolicy(routePolicies['/api/upload-splat'], handler)
