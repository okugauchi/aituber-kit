/**
 * @jest-environment node
 *
 * APIルートの静的チェック。
 * Pages Router の Node.js ランタイムでは、ハンドラーの返り値の
 * Web標準 Response は無視され、クライアントはタイムアウトまでハングする。
 * `return new Response(...)` パターンの再発を防ぐ（B1の再発防止）。
 */
import fs from 'fs'
import path from 'path'

const API_DIR = path.join(process.cwd(), 'src', 'pages', 'api')

function listRouteFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return listRouteFiles(fullPath)
    }
    if (/\.tsx?$/.test(entry.name)) {
      return [fullPath]
    }
    return []
  })
}

function isEdgeRuntime(source: string): boolean {
  return /runtime:\s*['"]edge['"]/.test(source)
}

describe('API route static checks', () => {
  const routeFiles = listRouteFiles(API_DIR)

  it('should find API route files', () => {
    expect(routeFiles.length).toBeGreaterThan(0)
  })

  it('should not return new Response() from Node runtime routes', () => {
    const violations: string[] = []

    for (const file of routeFiles) {
      const source = fs.readFileSync(file, 'utf8')
      if (isEdgeRuntime(source)) continue

      const lines = source.split('\n')
      lines.forEach((line, index) => {
        if (/return\s+new\s+Response\s*\(/.test(line)) {
          violations.push(
            `${path.relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`
          )
        }
      })
    }

    expect(violations).toEqual([])
  })
})
