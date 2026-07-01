const fs = require('fs')
const { parseEnv } = require('node:util')

const JSON_ENV_KEYS = new Set([
  'CUSTOM_API_HEADERS',
  'CUSTOM_API_BODY',
  'NEXT_PUBLIC_CUSTOM_API_HEADERS',
  'NEXT_PUBLIC_CUSTOM_API_BODY',
])

const HEADER_ENV_KEYS = new Set([
  'CUSTOM_API_HEADERS',
  'NEXT_PUBLIC_CUSTOM_API_HEADERS',
])

function findAssignmentLine(lines, key) {
  const prefix = `${key}=`
  return lines.findIndex((line) => line.startsWith(prefix))
}

function hasBalancedJson(value) {
  let depth = 0
  let inString = false
  let escaped = false
  let started = false

  for (const char of value) {
    if (!started) {
      if (/\s/.test(char)) continue
      if (char !== '{' && char !== '[') return false
      started = true
    }

    if (escaped) {
      escaped = false
      continue
    }

    if (char === '\\' && inString) {
      escaped = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (char === '{' || char === '[') depth += 1
    if (char === '}' || char === ']') depth -= 1
  }

  return started && depth === 0 && !inString
}

function readPossiblyMultilineJsonValue(raw, key) {
  const lines = raw.split(/\r?\n/)
  const lineIndex = findAssignmentLine(lines, key)
  if (lineIndex === -1) return undefined

  const prefix = `${key}=`
  const firstValue = lines[lineIndex].slice(prefix.length)
  const trimmed = firstValue.trimStart()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return firstValue
  }

  const chunks = [firstValue]
  for (let index = lineIndex + 1; index < lines.length; index += 1) {
    if (hasBalancedJson(chunks.join('\n'))) break
    chunks.push(lines[index])
  }

  const value = chunks.join('\n')
  return hasBalancedJson(value) ? value : firstValue
}

function normalizeValues(raw) {
  const values = parseEnv(raw)

  for (const key of JSON_ENV_KEYS) {
    const value = readPossiblyMultilineJsonValue(raw, key)
    if (value !== undefined) values[key] = normalizeJsonEnvValue(key, value)
  }

  return values
}

function parseHeaderLines(value) {
  const headers = {}
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return undefined

  for (const line of lines) {
    const separatorIndex =
      line.indexOf(':') >= 0 ? line.indexOf(':') : line.indexOf('=')
    if (separatorIndex <= 0) return undefined

    const key = line.slice(0, separatorIndex).trim()
    const headerValue = line.slice(separatorIndex + 1).trim()
    if (!key || !headerValue) return undefined

    headers[key] = headerValue
  }

  return headers
}

function normalizeJsonEnvValue(key, value) {
  if (!value) return value

  try {
    JSON.parse(value)
    return value
  } catch (error) {
    if (!HEADER_ENV_KEYS.has(key)) return value

    const headers = parseHeaderLines(value)
    if (headers === undefined) return value

    return JSON.stringify(headers)
  }
}

function validateJsonEnv(values) {
  for (const key of JSON_ENV_KEYS) {
    const value = values[key]
    if (!value) continue

    try {
      JSON.parse(value)
    } catch (error) {
      throw new Error(`${key} must be valid JSON: ${error.message}`)
    }
  }
}

function main() {
  const envPath = process.argv[2] || '.env.local'
  const raw = fs.readFileSync(envPath, 'utf8')
  const values = normalizeValues(raw)

  validateJsonEnv(values)

  const runtimeSecrets = Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) => !key.startsWith('NEXT_PUBLIC_') && value !== ''
    )
  )
  fs.writeFileSync(
    '.cloudflare-runtime-secrets.json',
    JSON.stringify(runtimeSecrets)
  )
}

if (require.main === module) {
  main()
}

module.exports = {
  normalizeValues,
  validateJsonEnv,
}
