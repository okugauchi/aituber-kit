const pMapSkip = Symbol('pMapSkip')

async function pMap(input, mapper) {
  const results = []
  let index = 0
  for await (const item of input) {
    const mapped = await mapper(item, index)
    if (mapped !== pMapSkip) {
      results.push(mapped)
    }
    index += 1
  }
  return results
}

async function* pMapIterable(input, mapper) {
  let index = 0
  for await (const item of input) {
    const mapped = await mapper(item, index)
    if (mapped !== pMapSkip) {
      yield mapped
    }
    index += 1
  }
}

module.exports = pMap
module.exports.default = pMap
module.exports.pMapIterable = pMapIterable
module.exports.pMapSkip = pMapSkip
