function estimateTokenCount(input) {
  return String(input ?? '')
    .split(/\s+/)
    .filter(Boolean).length
}

function approximateTokenSize(input) {
  return estimateTokenCount(input)
}

function isWithinTokenLimit(input, limit) {
  return estimateTokenCount(input) <= limit
}

function assertPositiveLimit(limit) {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError('limit must be a positive integer')
  }
}

function sliceByTokens(input, limit) {
  assertPositiveLimit(limit)
  return String(input ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, limit)
    .join(' ')
}

function splitByTokens(input, limit) {
  assertPositiveLimit(limit)
  const words = String(input ?? '')
    .split(/\s+/)
    .filter(Boolean)
  const chunks = []
  for (let i = 0; i < words.length; i += limit) {
    chunks.push(words.slice(i, i + limit).join(' '))
  }
  return chunks
}

module.exports = {
  approximateTokenSize,
  estimateTokenCount,
  isWithinTokenLimit,
  sliceByTokens,
  splitByTokens,
}
