import {
  isLocalOrPrivateHost,
  isLoopbackHost,
} from '@/lib/api-services/serverUrlGuard'

describe('serverUrlGuard', () => {
  describe('isLoopbackHost', () => {
    it('detects loopback names and addresses only', () => {
      expect(isLoopbackHost('localhost')).toBe(true)
      expect(isLoopbackHost('app.localhost')).toBe(true)
      expect(isLoopbackHost('127.0.0.1')).toBe(true)
      expect(isLoopbackHost('::1')).toBe(true)
      expect(isLoopbackHost('::ffff:127.0.0.1')).toBe(true)
      expect(isLoopbackHost('192.168.1.10')).toBe(false)
      expect(isLoopbackHost('::ffff:10.0.0.1')).toBe(false)
    })
  })

  describe('isLocalOrPrivateHost', () => {
    it('detects IPv4-mapped IPv6 localhost and private ranges', () => {
      expect(isLocalOrPrivateHost('::ffff:127.0.0.1')).toBe(true)
      expect(isLocalOrPrivateHost('::ffff:10.0.0.1')).toBe(true)
      expect(isLocalOrPrivateHost('0:0:0:0:0:ffff:192.168.1.10')).toBe(true)
    })

    it('detects compressed IPv4-mapped IPv6 private ranges', () => {
      expect(isLocalOrPrivateHost('::ffff:7f00:1')).toBe(true)
      expect(isLocalOrPrivateHost('::ffff:a00:1')).toBe(true)
      expect(isLocalOrPrivateHost('::ffff:c0a8:10a')).toBe(true)
    })

    it('does not treat public IPv4-mapped IPv6 addresses as private', () => {
      expect(isLocalOrPrivateHost('::ffff:8.8.8.8')).toBe(false)
      expect(isLocalOrPrivateHost('::ffff:808:808')).toBe(false)
    })

    it('detects the full IPv6 link-local range', () => {
      expect(isLocalOrPrivateHost('fe80::1')).toBe(true)
      expect(isLocalOrPrivateHost('fe90::1')).toBe(true)
      expect(isLocalOrPrivateHost('febf::1')).toBe(true)
      expect(isLocalOrPrivateHost('fec0::1')).toBe(false)
    })
  })
})
