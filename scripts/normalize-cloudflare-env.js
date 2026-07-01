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

  expandEnvReferences(values, JSON_ENV_KEYS)

  for (const key of JSON_ENV_KEYS) {
    const value = readPossiblyMultilineJsonValue(raw, key)
    if (value !== undefined) {
      values[key] = normalizeJsonEnvValue(key, value, values)
    }
  }

  return values
}

function expandEnvReferences(values, skippedKeys = new Set()) {
  for (const [key, value] of Object.entries(values)) {
    if (skippedKeys.has(key)) continue
    values[key] = expandEnvReferencesInValue(value, values)
  }
}

function expandEnvReferencesInValue(value, values) {
  if (typeof value === 'string') {
    return expandStringEnvReferences(value, values)
  }

  if (Array.isArray(value)) {
    return value.map((item) => expandEnvReferencesInValue(item, values))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        expandEnvReferencesInValue(item, values),
      ])
    )
  }

  return value
}

function expandStringEnvReferences(value, values) {
  if (!value.includes('$')) return value

  const envReferencePattern = /\$\{([A-Z0-9_]+)\}|\$([A-Z0-9_]+)/g

  return value.replace(envReferencePattern, (match, bracedKey, bareKey) => {
    const envKey = bracedKey || bareKey
    if (!Object.prototype.hasOwnProperty.call(values, envKey)) return match

    const replacement = getEnvReferenceReplacement(values[envKey])
    return replacement === undefined ? match : replacement
  })
}

function getEnvReferenceReplacement(value) {
  if (['string', 'number', 'boolean', 'bigint'].includes(typeof value)) {
    return String(value)
  }

  return undefined
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

function normalizeJsonEnvValue(key, value, referenceValues = {}) {
  if (!value) return value

  const jsonValue = parseJsonValue(key, value, referenceValues)
  if (jsonValue !== undefined) return jsonValue

  const unescapedValue = value.replace(/\\+"/g, '"')
  if (unescapedValue !== value) {
    const unescapedJsonValue = parseJsonValue(
      key,
      unescapedValue,
      referenceValues
    )
    if (unescapedJsonValue !== undefined) return unescapedJsonValue
  }

  if (!HEADER_ENV_KEYS.has(key)) return value

  const headers = parseHeaderLines(value)
  if (headers === undefined) return value

  const expandedHeaders = expandEnvReferencesInValue(headers, referenceValues)
  const normalizedHeaders = normalizeHeaderObject(expandedHeaders)
  return normalizedHeaders === undefined
    ? value
    : JSON.stringify(normalizedHeaders)
}

function parseJsonValue(key, value, referenceValues) {
  try {
    const parsed = JSON.parse(value)
    if (typeof parsed === 'string') {
      return parseJsonValue(
        key,
        expandStringEnvReferences(parsed, referenceValues),
        referenceValues
      )
    }
    const expandedValue = expandEnvReferencesInValue(parsed, referenceValues)
    if (HEADER_ENV_KEYS.has(key)) {
      const headers = normalizeHeaderObject(expandedValue)
      if (headers === undefined) return undefined
      return JSON.stringify(headers)
    }
    return JSON.stringify(expandedValue)
  } catch (error) {
    return undefined
  }
}

function normalizeHeaderObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const headers = {}
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = normalizeHeaderName(rawKey)
    if (!isValidHeaderName(key)) return undefined

    headers[key] = normalizeHeaderValue(rawValue)
  }

  return headers
}

function normalizeHeaderName(value) {
  return String(value)
    .trim()
    .replace(/\\+"/g, '"')
    .replace(/^[{\\'"]+/, '')
    .replace(/[}\\'"]+$/, '')
    .trim()
}

function normalizeHeaderValue(value) {
  return String(value)
    .trim()
    .replace(/\\+"/g, '"')
    .replace(/^[\\'"]+/, '')
    .replace(/[\\'"]+$/, '')
    .trim()
}

function isValidHeaderName(value) {
  return /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value)
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
