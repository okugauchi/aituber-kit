import { LipSync } from '@/features/lipSync/lipSync'

describe('LipSync PCM16 streaming', () => {
  it('schedules incoming PCM before the stream finishes', async () => {
    const starts: number[] = []
    const sourceNodes: Array<{
      buffer: AudioBuffer | null
      onended: (() => void) | null
      connect: jest.Mock
      start: jest.Mock
      stop: jest.Mock
    }> = []
    const audioContext = {
      state: 'running',
      currentTime: 0,
      destination: {},
      createAnalyser: jest.fn(() => ({
        getFloatTimeDomainData: jest.fn(),
      })),
      createBuffer: jest.fn(
        (_channels: number, length: number, sampleRate: number) => ({
          duration: length / sampleRate,
          getChannelData: () => new Float32Array(length),
        })
      ),
      createBufferSource: jest.fn(() => {
        const source: {
          buffer: AudioBuffer | null
          onended: (() => void) | null
          connect: jest.Mock
          start: jest.Mock
          stop: jest.Mock
        } = {
          buffer: null,
          onended: null,
          connect: jest.fn(),
          start: jest.fn((at: number) => {
            starts.push(at)
            queueMicrotask(() => source.onended?.())
          }),
          stop: jest.fn(() => source.onended?.()),
        }
        sourceNodes.push(source)
        return source
      }),
      resume: jest.fn(),
    }
    const lipSync = new LipSync(audioContext as unknown as AudioContext, {
      forceStart: true,
    })
    const onStarted = jest.fn()
    const pcmChunk = new Uint8Array(3200)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(pcmChunk)
        controller.enqueue(pcmChunk)
        controller.close()
      },
    })

    await lipSync.playPcm16Stream(stream, undefined, 16000, onStarted)

    expect(audioContext.createBuffer).toHaveBeenCalledTimes(2)
    expect(sourceNodes).toHaveLength(2)
    expect(starts[0]).toBeLessThan(starts[1])
    expect(onStarted).toHaveBeenCalledTimes(1)
  })

  it('does not restart a pending stream after playback is stopped', async () => {
    const createBufferSource = jest.fn()
    const audioContext = {
      state: 'suspended',
      currentTime: 0,
      destination: {},
      createAnalyser: jest.fn(() => ({
        getFloatTimeDomainData: jest.fn(),
      })),
      createBuffer: jest.fn(),
      createBufferSource,
      resume: jest.fn().mockResolvedValue(undefined),
    }
    const lipSync = new LipSync(audioContext as unknown as AudioContext)
    const playback = lipSync.playPcm16Stream(
      new ReadableStream<Uint8Array>(),
      undefined,
      16000
    )

    await Promise.resolve()
    lipSync.stopCurrentPlayback()
    window.dispatchEvent(new Event('click'))
    await playback

    expect(createBufferSource).not.toHaveBeenCalled()
  })
})
