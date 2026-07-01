const {
  normalizeValues,
  validateJsonEnv,
} = require('../../../scripts/normalize-cloudflare-env.js')

describe('normalize-cloudflare-env', () => {
  it('expands references inside JSON env values before stringifying them', () => {
    const values = normalizeValues(
      [
        'ANTHROPIC_API_KEY=sk-ant-test-"quoted"\\value',
        'CUSTOM_API_HEADERS={',
        '  "Authorization": "Bearer $ANTHROPIC_API_KEY",',
        '  "anthropic-version": "2023-06-01"',
        '}',
      ].join('\n')
    )

    validateJsonEnv(values)

    expect(JSON.parse(values.CUSTOM_API_HEADERS)).toEqual({
      Authorization: 'Bearer sk-ant-test-"quoted"\\value',
      'anthropic-version': '2023-06-01',
    })
  })

  it('escapes referenced JSON-like strings inside JSON env values', () => {
    const values = normalizeValues(
      [
        'CUSTOM_API_BODY={"model":"claude-sonnet-4-5","nested":{"id":"abc"}}',
        'CUSTOM_API_HEADERS={"x-debug":"$CUSTOM_API_BODY"}',
      ].join('\n')
    )

    validateJsonEnv(values)

    expect(JSON.parse(values.CUSTOM_API_HEADERS)).toEqual({
      'x-debug': '{"model":"claude-sonnet-4-5","nested":{"id":"abc"}}',
    })
  })
})
