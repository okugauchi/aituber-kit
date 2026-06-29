import { isEmbedOriginAllowed } from '@/features/embed/embedConfig'

describe('isEmbedOriginAllowed', () => {
  it('allows empty referrer when allowedOrigins is not configured', () => {
    expect(isEmbedOriginAllowed({}, '')).toBe(true)
  })

  it('rejects empty referrer when allowedOrigins is configured', () => {
    expect(
      isEmbedOriginAllowed({ allowedOrigins: ['https://example.com'] }, '')
    ).toBe(false)
  })

  it('allows only matching origins when allowedOrigins is configured', () => {
    expect(
      isEmbedOriginAllowed(
        { allowedOrigins: ['https://example.com'] },
        'https://example.com/posts/1'
      )
    ).toBe(true)
    expect(
      isEmbedOriginAllowed(
        { allowedOrigins: ['https://example.com'] },
        'https://attacker.example/posts/1'
      )
    ).toBe(false)
  })
})
