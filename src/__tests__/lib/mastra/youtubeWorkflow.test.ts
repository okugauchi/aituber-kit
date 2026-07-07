import { generateText } from 'ai'

jest.mock('ai', () => ({
  generateText: jest.fn(),
}))

// Import after mock
import { RequestContext } from '@mastra/core/request-context'
import { mastra } from '@/lib/mastra'

const mockGenerateText = generateText as jest.MockedFunction<
  typeof generateText
>

const buildInput = (overrides: any = {}) => ({
  chatLog: [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hi there' },
  ],
  systemPrompt: 'You are helpful.',
  youtubeComments: [],
  noCommentCount: 0,
  continuationCount: 0,
  sleepMode: false,
  newTopicThreshold: 3,
  sleepThreshold: 6,
  ...overrides,
})

const runWorkflow = async (inputData: any) => {
  const workflow = mastra.getWorkflow('conversationWorkflow')
  const run = await workflow.createRun()
  return run.start({
    inputData,
    requestContext: new RequestContext([
      ['languageModel', 'mock-model'],
      ['temperature', 1.0],
      ['maxTokens', 4096],
    ]),
  })
}

const expectSuccess = (result: any) => {
  expect(result.status).toBe('success')
  return result.result
}

describe('conversationWorkflow - 分岐ルーティング', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // デフォルト: 継続チェックは false（視聴者の番）
    mockGenerateText.mockResolvedValue({
      text: '{"answer": "false", "reason": "区切りがついた"}',
    } as any)
  })

  describe('継続分岐（shouldContinue=true → build-continuation）', () => {
    it('AIが継続を判断した場合、会話継続メッセージを構築する', async () => {
      mockGenerateText.mockResolvedValue({
        text: '{"answer": "true", "reason": "話の途中"}',
      } as any)

      const result = await runWorkflow(buildInput())
      const output = expectSuccess(result)

      expect(output.action).toBe('process_messages')
      expect(output.messages![0].role).toBe('system')
      expect(output.stateUpdates).toEqual({
        noCommentCount: 1,
        continuationCount: 1,
        sleepMode: false,
      })
    })

    it('コメントがあっても継続判定が優先される', async () => {
      mockGenerateText.mockResolvedValue({
        text: '{"answer": "true", "reason": "話の途中"}',
      } as any)

      const result = await runWorkflow(
        buildInput({
          youtubeComments: [
            { userName: 'user1', userIconUrl: '', userComment: 'こんにちは' },
          ],
        })
      )
      const output = expectSuccess(result)

      // 継続分岐が選択され、コメント選択（send_comment）は実行されない
      expect(output.action).toBe('process_messages')
      expect(output.stateUpdates.continuationCount).toBe(1)
    })
  })

  describe('コメントあり分岐（hasComments=true → select-best-comment）', () => {
    it('コメントがある場合、最適コメントを選択して send_comment を返す', async () => {
      mockGenerateText
        .mockResolvedValueOnce({
          text: '{"answer": "false", "reason": "区切りがついた"}',
        } as any)
        .mockResolvedValueOnce({
          text: '明日は雨？',
        } as any)

      const result = await runWorkflow(
        buildInput({
          youtubeComments: [
            { userName: 'user1', userIconUrl: '', userComment: 'いい天気だね' },
            { userName: 'user2', userIconUrl: '', userComment: '明日は雨？' },
          ],
        })
      )
      const output = expectSuccess(result)

      expect(output.action).toBe('send_comment')
      expect(output.comment).toBe('明日は雨？')
      expect(output.userName).toBe('user2')
      expect(output.stateUpdates).toEqual({
        noCommentCount: 0,
        continuationCount: 0,
        sleepMode: false,
      })
    })
  })

  describe('新トピック分岐（count===newTopicThreshold → generate-new-topic）', () => {
    it('noCommentCountが閾値に達した場合、新トピックを生成する', async () => {
      mockGenerateText
        .mockResolvedValueOnce({
          text: '{"answer": "false", "reason": "区切りがついた"}',
        } as any)
        .mockResolvedValueOnce({
          text: '最近見た映画',
        } as any)

      // noCommentCount: 2 → newNoCommentCount: 3 === newTopicThreshold
      const result = await runWorkflow(buildInput({ noCommentCount: 2 }))
      const output = expectSuccess(result)

      expect(output.action).toBe('process_messages')
      expect(output.messages![0].content).toContain('最近見た映画')
      expect(output.stateUpdates).toEqual({
        noCommentCount: 3,
        continuationCount: 0,
        sleepMode: false,
      })
    })
  })

  describe('スリープ分岐（count===sleepThreshold → build-sleep）', () => {
    it('noCommentCountがスリープ閾値に達した場合、sleepアクションを返す', async () => {
      // noCommentCount: 5 → newNoCommentCount: 6 === sleepThreshold
      const result = await runWorkflow(buildInput({ noCommentCount: 5 }))
      const output = expectSuccess(result)

      expect(output.action).toBe('sleep')
      expect(output.messages).toBeDefined()
      expect(output.stateUpdates).toEqual({
        noCommentCount: 6,
        continuationCount: 0,
        sleepMode: true,
      })
    })
  })

  describe('スリープ中分岐（count>sleepThreshold → build-do-nothing）', () => {
    it('スリープ中は何もしない', async () => {
      // sleepMode=true なので継続チェックのAI呼び出しもスキップされる
      const result = await runWorkflow(
        buildInput({ noCommentCount: 7, sleepMode: true })
      )
      const output = expectSuccess(result)

      expect(output.action).toBe('do_nothing')
      expect(output.stateUpdates).toEqual({
        noCommentCount: 8,
        continuationCount: 0,
        sleepMode: true,
      })
      expect(mockGenerateText).not.toHaveBeenCalled()
    })

    it('スリープ中にコメントが来たらコメント選択に復帰する', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'おはよう',
      } as any)

      const result = await runWorkflow(
        buildInput({
          noCommentCount: 8,
          sleepMode: true,
          youtubeComments: [
            { userName: 'user1', userIconUrl: '', userComment: 'おはよう' },
          ],
        })
      )
      const output = expectSuccess(result)

      expect(output.action).toBe('send_comment')
      expect(output.comment).toBe('おはよう')
      expect(output.stateUpdates.sleepMode).toBe(false)
      expect(output.stateUpdates.noCommentCount).toBe(0)
    })
  })

  describe('デフォルト分岐（count<newTopicThreshold等 → build-continue-no-comment）', () => {
    it('コメントなしで閾値未満の場合、会話継続メッセージを構築する', async () => {
      const result = await runWorkflow(buildInput({ noCommentCount: 0 }))
      const output = expectSuccess(result)

      expect(output.action).toBe('process_messages')
      expect(output.messages).toBeDefined()
      expect(output.stateUpdates).toEqual({
        noCommentCount: 1,
        continuationCount: 0,
        sleepMode: false,
      })
    })

    it('newTopicThresholdとsleepThresholdの中間値もデフォルト分岐になる', async () => {
      // noCommentCount: 3 → newNoCommentCount: 4（3<4<6 の中間値）
      const result = await runWorkflow(buildInput({ noCommentCount: 3 }))
      const output = expectSuccess(result)

      expect(output.action).toBe('process_messages')
      expect(output.stateUpdates.noCommentCount).toBe(4)
      expect(output.stateUpdates.sleepMode).toBe(false)
    })
  })

  describe('RequestContextの伝播', () => {
    it('languageModel・temperature・maxTokensがAI呼び出しに渡される', async () => {
      await runWorkflow(buildInput())

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'mock-model',
          temperature: 1.0,
          maxOutputTokens: 4096,
        })
      )
    })
  })
})
