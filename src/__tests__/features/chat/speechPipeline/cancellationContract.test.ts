/**
 * キャンセレーション意味論の契約テスト
 * （docs/streaming-pipeline-design.md §6 の各行を固定する）
 */
import { processAIResponse } from '@/features/chat/speechPipeline/processAIResponse'
import { __resetLatestResponseSessionId } from '@/features/chat/speechPipeline/speechDispatcher'
import { getAIChatResponseStream } from '@/features/chat/aiChatFactory'
import { speakCharacter } from '@/features/messages/speakCharacter'
import { SpeakQueue } from '@/features/messages/speakQueue'
import { getCharacterRenderer } from '@/features/messages/characterRenderer'
import homeStore from '@/features/stores/home'
import { Message } from '@/features/messages/messages'

jest.mock('@/features/chat/aiChatFactory', () => ({
  getAIChatResponseStream: jest.fn(),
}))

jest.mock('@/features/messages/speakCharacter', () => ({
  speakCharacter: jest.fn(),
}))

jest.mock('@/features/messages/characterRenderer', () => ({
  getCharacterRenderer: jest.fn(),
}))

jest.mock('@/features/memory/memoryStoreSync', () => ({
  saveMessageToMemory: jest.fn().mockResolvedValue(undefined),
  searchMemoryContext: jest.fn().mockResolvedValue(''),
}))

jest.mock('@/features/stores/home', () => ({
  getState: jest.fn(),
  setState: jest.fn(),
}))

jest.mock('@/features/stores/settings', () => ({
  getState: jest.fn(),
}))

/** チャンクの合間に割り込み処理を差し込めるストリームを作る */
const createControlledStream = (
  parts: Array<string | (() => void)>
): ReadableStream<string> => {
  const queue = [...parts]
  return new ReadableStream<string>(
    {
      pull(controller) {
        while (queue.length > 0) {
          const next = queue.shift()!
          if (typeof next === 'function') {
            next()
          } else {
            controller.enqueue(next)
            return
          }
        }
        controller.close()
      },
    },
    // 先読み（プリフェッチ）を無効化し、コンシューマーが1チャンク処理し終える
    // まで次のpull（割り込み関数の実行を含む）を遅延させる
    { highWaterMark: 0 }
  )
}

const mockResetToIdle = jest.fn()

describe('キャンセレーション契約（設計§6）', () => {
  let chatLog: Message[]

  beforeEach(() => {
    jest.clearAllMocks()
    __resetLatestResponseSessionId()
    chatLog = []
    ;(homeStore.getState as jest.Mock).mockReturnValue({
      isSpeaking: false,
      chatProcessing: false,
      viewer: { model: null },
      upsertMessage: jest.fn((m: Message) => {
        const i = chatLog.findIndex((x) => x.id !== undefined && x.id === m.id)
        if (i !== -1) chatLog[i] = { ...chatLog[i], ...m }
        else chatLog.push(m)
      }),
    })
    const settingsStore = jest.requireMock('@/features/stores/settings')
    ;(settingsStore.getState as jest.Mock).mockReturnValue({
      thinkingPoseEnabled: false,
      modelType: 'vrm',
      poseConfigs: [],
    })
    ;(getCharacterRenderer as jest.Mock).mockReturnValue({
      speak: jest.fn(),
      stopSpeaking: jest.fn(),
      resetToIdle: mockResetToIdle,
    })
    // SpeakQueueのグローバル状態を空転状態へ戻す
    SpeakQueue.getInstance().clearQueue()
  })

  const runWithStream = async (parts: Array<string | (() => void)>) => {
    ;(getAIChatResponseStream as jest.Mock).mockResolvedValue(
      createControlledStream(parts)
    )
    await processAIResponse([{ role: 'user', content: 'テスト' }])
  }

  it('6-1: 発話開始後のstopAllで以後speakCharacterは呼ばれず、表示は完成し、finalizeが発火する', async () => {
    const completionCallback = jest.fn()
    SpeakQueue.onSpeakCompletion(completionCallback)

    try {
      await runWithStream([
        '一文目です。',
        () => SpeakQueue.stopAll(),
        '二文目です。',
        '三文目です。',
      ])

      // 発話は停止前の1回のみ
      expect(speakCharacter).toHaveBeenCalledTimes(1)
      expect((speakCharacter as jest.Mock).mock.calls[0][1].message).toBe(
        '一文目です。'
      )

      // 表示（chatLog）は最後まで完成する
      const assistant = chatLog.find((m) => m.role === 'assistant')
      expect(assistant?.content).toBe('一文目です。二文目です。三文目です。')

      // 停止で打ち切られた場合のファイナライゼーション（設計§5.4）
      expect(completionCallback).toHaveBeenCalled()
      expect(mockResetToIdle).toHaveBeenCalled()
    } finally {
      SpeakQueue.removeSpeakCompletionCallback(completionCallback)
    }
  })

  it('6-2/6-6: 新しい応答セッションが始まると旧応答は以後発話しない', async () => {
    // 手動制御ストリームで応答Aの途中に応答Bを割り込ませる
    let controllerA!: ReadableStreamDefaultController<string>
    const streamA = new ReadableStream<string>({
      start(c) {
        controllerA = c
      },
    })
    ;(getAIChatResponseStream as jest.Mock).mockResolvedValueOnce(streamA)
    const responseA = processAIResponse([{ role: 'user', content: '旧' }])

    controllerA.enqueue('旧応答の一文目。')
    await new Promise((r) => setTimeout(r, 0))
    expect(
      (speakCharacter as jest.Mock).mock.calls.map((c) => c[1].message)
    ).toEqual(['旧応答の一文目。'])

    // 応答Bを開始して完了させる
    ;(getAIChatResponseStream as jest.Mock).mockResolvedValueOnce(
      createControlledStream(['新応答の一文目。'])
    )
    await processAIResponse([{ role: 'user', content: '新' }])

    // 応答Aのストリームが続きを流しても、Aはもう発話しない
    controllerA.enqueue('旧応答の二文目。')
    controllerA.close()
    await responseA

    const spoken = (speakCharacter as jest.Mock).mock.calls.map(
      (c) => c[1].message
    )
    expect(spoken).toEqual(['旧応答の一文目。', '新応答の一文目。'])

    // 旧セッションのsessionIdと新セッションのsessionIdは異なる
    const sessionIds = (speakCharacter as jest.Mock).mock.calls.map((c) => c[0])
    expect(sessionIds[0]).not.toBe(sessionIds[1])
  })

  it('6-3: 自セッションへのstopSessionで以後speakCharacterは呼ばれない', async () => {
    await runWithStream([
      '一文目です。',
      () => {
        // このセッションのsessionIdは最初のspeakCharacter呼び出しから取得する
        const ownSessionId = (speakCharacter as jest.Mock).mock.calls[0][0]
        SpeakQueue.getInstance().checkSessionId(ownSessionId)
        SpeakQueue.stopSession(ownSessionId)
      },
      '二文目です。',
      '三文目です。',
    ])

    expect(speakCharacter).toHaveBeenCalledTimes(1)
    expect((speakCharacter as jest.Mock).mock.calls[0][1].message).toBe(
      '一文目です。'
    )
  })

  it('6-4: 他セッションへのstopSessionでは発話を継続する', async () => {
    await runWithStream([
      '一文目です。',
      () => {
        SpeakQueue.getInstance().checkSessionId('game-commentary-123')
        SpeakQueue.stopSession('game-commentary-123')
      },
      '二文目です。',
    ])

    const spoken = (speakCharacter as jest.Mock).mock.calls.map(
      (c) => c[1].message
    )
    expect(spoken).toEqual(['一文目です。', '二文目です。'])
    // 継続したのでファイナライゼーションは発火しない
    expect(mockResetToIdle).not.toHaveBeenCalled()
  })

  it('6-5: 初回発話前のstopAllでは応答は通常通り発話する（遅延捕捉）', async () => {
    await runWithStream([
      () => SpeakQueue.stopAll(),
      '停止後に届いた応答です。',
    ])

    expect(speakCharacter).toHaveBeenCalledTimes(1)
    expect((speakCharacter as jest.Mock).mock.calls[0][1].message).toBe(
      '停止後に届いた応答です。'
    )
  })

  it('停止されなかった応答ではfinalizeIfIdleを呼ばない', async () => {
    await runWithStream(['通常の応答です。'])
    expect(mockResetToIdle).not.toHaveBeenCalled()
  })

  it('新応答が発話中（isSpeaking）ならfinalizeIfIdleはno-op', async () => {
    ;(homeStore.getState as jest.Mock).mockReturnValue({
      isSpeaking: true,
      chatProcessing: false,
      viewer: { model: null },
      upsertMessage: jest.fn(),
    })
    await runWithStream([
      '一文目です。',
      () => SpeakQueue.stopAll(),
      '二文目です。',
    ])
    expect(mockResetToIdle).not.toHaveBeenCalled()
  })
})
