const mockHomeGetState = jest.fn()
jest.mock('@/features/stores/home', () => ({
  getState: (...args: unknown[]) => mockHomeGetState(...args),
}))

const mockSettingsGetState = jest.fn()
jest.mock('@/features/stores/settings', () => ({
  getState: (...args: unknown[]) => mockSettingsGetState(...args),
}))

jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}))

import { Live2DHandler } from '@/features/messages/live2dHandler'
import type { Talk } from '@/features/messages/messages'

const originalAudioContext = global.AudioContext
const originalOfflineAudioContext = global.OfflineAudioContext
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

const mockDecodeAudioData = jest.fn()
const mockCreateBuffer = jest.fn()
const mockOfflineCreateBufferSource = jest.fn()
const mockOfflineStartRendering = jest.fn()
const mockCreateObjectURL = jest.fn(() => 'blob:live2d-audio')
const mockRevokeObjectURL = jest.fn()
const mockSourceConnect = jest.fn()
const mockSourceStart = jest.fn()

const renderedBuffer = {
  numberOfChannels: 1,
  length: 2,
  sampleRate: 24000,
  getChannelData: jest.fn(() => new Float32Array([0, 0.5])),
} as unknown as AudioBuffer

class MockAudioContext {
  decodeAudioData = mockDecodeAudioData
  createBuffer = mockCreateBuffer
}

class MockOfflineAudioContext {
  destination = {}

  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number
  ) {}

  createBufferSource = mockOfflineCreateBufferSource
  startRendering = mockOfflineStartRendering
}

const createDecodedAudio = (duration = 0.01) =>
  ({
    numberOfChannels: 1,
    length: 2,
    sampleRate: 24000,
    duration,
    getChannelData: jest.fn(() => new Float32Array([0, 0.25])),
  }) as unknown as AudioBuffer

const setupAudioMocks = () => {
  const decodedAudio = createDecodedAudio()
  const pcmChannelData = new Float32Array(2)
  const pcmAudio = {
    numberOfChannels: 1,
    length: 2,
    sampleRate: 24000,
    duration: 2 / 24000,
    getChannelData: jest.fn(() => pcmChannelData),
  } as unknown as AudioBuffer

  mockDecodeAudioData.mockResolvedValue(decodedAudio)
  mockCreateBuffer.mockReturnValue(pcmAudio)
  mockOfflineCreateBufferSource.mockReturnValue({
    connect: mockSourceConnect,
    start: mockSourceStart,
    set buffer(_buffer: AudioBuffer) {},
  })
  mockOfflineStartRendering.mockResolvedValue(renderedBuffer)

  Object.defineProperty(global, 'AudioContext', {
    configurable: true,
    value: MockAudioContext,
  })
  Object.defineProperty(global, 'OfflineAudioContext', {
    configurable: true,
    value: MockOfflineAudioContext,
  })
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: mockCreateObjectURL,
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: mockRevokeObjectURL,
  })

  return { decodedAudio, pcmChannelData }
}

const setupStores = () => {
  const live2dViewer = {
    expression: jest.fn(),
    motion: jest.fn(),
    speak: jest.fn(
      (
        _audioUrl: string,
        options: {
          onFinish?: () => void
          onError?: (error: Error) => void
        }
      ) => {
        options.onFinish?.()
      }
    ),
    stopSpeaking: jest.fn(),
    destroyed: false,
  }

  mockHomeGetState.mockReturnValue({ live2dViewer })
  mockSettingsGetState.mockReturnValue({
    modelType: 'live2d',
    neutralEmotions: ['neutral-01'],
    neutralMotionGroup: 'NeutralMotion',
    happyEmotions: ['happy-01'],
    happyMotionGroup: 'HappyMotion',
    sadEmotions: ['sad-01'],
    sadMotionGroup: 'SadMotion',
    angryEmotions: ['angry-01'],
    angryMotionGroup: 'AngryMotion',
    relaxedEmotions: ['relaxed-01'],
    relaxedMotionGroup: 'RelaxedMotion',
    surprisedEmotions: ['surprised-01'],
    surprisedMotionGroup: 'SurprisedMotion',
    idleMotionGroup: 'Idle',
  })

  return live2dViewer
}

describe('Live2DHandler', () => {
  const talk: Talk = { emotion: 'happy', message: 'hello' }

  beforeEach(() => {
    jest.clearAllMocks()
    setupAudioMocks()
  })

  afterAll(() => {
    Object.defineProperty(global, 'AudioContext', {
      configurable: true,
      value: originalAudioContext,
    })
    Object.defineProperty(global, 'OfflineAudioContext', {
      configurable: true,
      value: originalOfflineAudioContext,
    })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectURL,
    })
  })

  it('decodes compressed audio and sends it to the Live2D viewer with emotion and motion', async () => {
    const live2dViewer = setupStores()
    const audioBuffer = new ArrayBuffer(8)

    await Live2DHandler.speak(audioBuffer, talk, true)

    expect(mockDecodeAudioData).toHaveBeenCalledWith(audioBuffer)
    expect(live2dViewer.expression).toHaveBeenCalledWith('happy-01')
    expect(live2dViewer.motion).toHaveBeenCalledWith(
      'HappyMotion',
      undefined,
      3
    )
    expect(live2dViewer.speak).toHaveBeenCalledWith(
      'blob:live2d-audio',
      expect.objectContaining({
        volume: 1.0,
        expression: 'happy-01',
        resetExpression: true,
      })
    )
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:live2d-audio')
  })

  it('converts PCM16 audio into a 24kHz AudioBuffer before rendering', async () => {
    setupStores()
    const { pcmChannelData } = setupAudioMocks()
    const pcm = new Int16Array([-32768, 32767])

    await Live2DHandler.speak(pcm.buffer, talk, false)

    expect(mockDecodeAudioData).not.toHaveBeenCalled()
    expect(mockCreateBuffer).toHaveBeenCalledWith(1, 2, 24000)
    expect(Array.from(pcmChannelData)).toEqual([-1, 1])
  })

  it('does nothing when no Live2D viewer is loaded', async () => {
    mockHomeGetState.mockReturnValue({ live2dViewer: null })

    await Live2DHandler.speak(new ArrayBuffer(8), talk, true)

    expect(mockDecodeAudioData).not.toHaveBeenCalled()
    expect(mockCreateObjectURL).not.toHaveBeenCalled()
  })

  it('delegates stopSpeaking to the Live2D viewer when loaded', async () => {
    const live2dViewer = setupStores()

    await Live2DHandler.stopSpeaking()

    expect(live2dViewer.stopSpeaking).toHaveBeenCalled()
  })
})
