/**
 * @jest-environment node
 *
 * APIルートの静的チェック。
 *
 * 1. `return new Response(...)` パターンの再発防止（B1）:
 *    Pages Router の Node.js ランタイムでは、ハンドラーの返り値の
 *    Web標準 Response は無視され、クライアントはタイムアウトまでハングする。
 *
 * 2. 統一アクセスポリシーの登録保証（F1 / docs/access-policy-design.md §7.2）:
 *    全ルートが routePolicies に登録され withAccessPolicy でラップされて
 *    いることを保証する。新ルート追加時にポリシー未登録だとここで落ちる。
 */
import fs from 'fs'
import path from 'path'
import { routePolicies } from '@/lib/accessPolicy/routePolicies'

const API_DIR = path.join(process.cwd(), 'src', 'pages', 'api')

/**
 * withAccessPolicy への移行が完了していないルート。
 * F1移行完了により空。新規ルートは必ず withAccessPolicy でラップすること
 * （ここへの追加は禁止）。
 */
const PENDING_MIGRATION: string[] = []

function routePathFromFile(file: string): string {
  const relative = path.relative(path.join(process.cwd(), 'src', 'pages'), file)
  return `/${relative.replace(/\\/g, '/').replace(/\.tsx?$/, '')}`
}

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

  describe('unified access policy (F1)', () => {
    const routePaths = routeFiles.map(routePathFromFile)
    const policyPaths = Object.keys(routePolicies)

    it('should register every API route file in routePolicies', () => {
      const unregistered = routePaths.filter(
        (routePath) => !policyPaths.includes(routePath)
      )
      expect(unregistered).toEqual([])
    })

    it('should not declare policies for nonexistent routes', () => {
      const stale = policyPaths.filter(
        (policyPath) => !routePaths.includes(policyPath)
      )
      expect(stale).toEqual([])
    })

    it('should keep policy keys consistent with their path field', () => {
      const mismatched = Object.entries(routePolicies)
        .filter(([key, policy]) => key !== policy.path)
        .map(([key, policy]) => `${key} != ${policy.path}`)
      expect(mismatched).toEqual([])
    })

    it('should wrap every migrated route with withAccessPolicy', () => {
      const violations: string[] = []

      for (const file of routeFiles) {
        const routePath = routePathFromFile(file)
        if (PENDING_MIGRATION.includes(routePath)) continue

        const source = fs.readFileSync(file, 'utf8')
        if (!/export\s+default\s+withAccessPolicy\s*\(/.test(source)) {
          violations.push(routePath)
        }
      }

      expect(violations).toEqual([])
    })

    it('should call gate.guardServerSecret in dynamic-secret routes', () => {
      const violations: string[] = []

      for (const [policyPath, policy] of Object.entries(routePolicies)) {
        if (policy.secret.kind !== 'dynamic') continue
        if (PENDING_MIGRATION.includes(policyPath)) continue

        const file = path.join(
          process.cwd(),
          'src',
          'pages',
          `${policyPath.slice(1)}.ts`
        )
        const source = fs.readFileSync(file, 'utf8')
        if (!/gate\.guardServerSecret\s*\(/.test(source)) {
          violations.push(policyPath)
        }
      }

      expect(violations).toEqual([])
    })

    it('should keep routePolicies.ts free of runtime imports (WAF type stripping)', () => {
      const source = fs.readFileSync(
        path.join(
          process.cwd(),
          'src',
          'lib',
          'accessPolicy',
          'routePolicies.ts'
        ),
        'utf8'
      )
      const runtimeImports = source
        .split('\n')
        .filter((line) => /^\s*import\s/.test(line))
        .filter((line) => !/^\s*import\s+type\s/.test(line))
      expect(runtimeImports).toEqual([])
    })

    it('should not add unauthenticated external-control routes beyond the known legacy queue', () => {
      const legacyAllowed = ['/api/messages']
      const violations = Object.entries(routePolicies)
        .filter(
          ([, policy]) =>
            policy.resources.includes('external-control') &&
            !policy.requiresApiKey
        )
        .map(([key]) => key)
        .filter((key) => !legacyAllowed.includes(key))
      expect(violations).toEqual([])
    })
  })
})
