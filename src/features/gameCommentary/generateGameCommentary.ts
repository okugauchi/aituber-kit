import { getAIChatResponseStream } from '@/features/chat/aiChatFactory'
import { THINKING_MARKER } from '@/features/chat/vercelAIChat'
import { Message, EmotionType, EMOTIONS } from '@/features/messages/messages'
import settingsStore from '@/features/stores/settings'

const GAME_COMMENTARY_SYSTEM_PROMPT_SUFFIX = `

感情の種類にはneutral, happy, angry, sad, relaxed, surprisedの6つがあります。
回答は以下の書式で返してください。
[{感情}]{セリフ}

例: [happy]すごい！ここでまさかの大逆転だ！

セリフを一つだけ返してください。`

/**
 * ゲーム実況コメントを生成する
 *
 * キャラクターのシステムプロンプト + 実況プロンプトテンプレートを組み合わせ、
 * 画面キャプチャ画像と実況履歴を基にAIがコメントを生成する。
 */
export async function generateGameCommentary(
  commentaryHistory: string[],
  imageData: string
): Promise<{ text: string; emotion: EmotionType } | null> {
  const ss = settingsStore.getState()
  const characterPrompt = ss.systemPrompt || ''
  const commentaryPrompt =
    ((ss as Record<string, unknown>).gameCommentaryPromptTemplate as string) ||
    ''

  const systemPrompt =
    characterPrompt +
    '\n\n' +
    commentaryPrompt +
    GAME_COMMENTARY_SYSTEM_PROMPT_SUFFIX

  const messages: Message[] = [{ role: 'system', content: systemPrompt }]

  // 実況履歴を文脈メッセージとして追加（テキストのみ、画像なし）
  for (const history of commentaryHistory) {
    messages.push({ role: 'assistant', content: history })
  }

  // 現在フレームのキャプチャ画像をuserメッセージに添付
  messages.push({
    role: 'user',
    content: [
      { type: 'image', image: imageData },
      { type: 'text', text: '画面の状況を実況してください。' },
    ],
  })

  try {
    const stream = await getAIChatResponseStream(messages)
    if (!stream) return null

    const reader = stream.getReader()
    let fullText = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value && !value.startsWith(THINKING_MARKER)) {
          fullText += value
        }
      }
    } finally {
      reader.releaseLock()
    }

    fullText = fullText.trim()
    if (!fullText) return null

    return parseEmotionAndText(fullText)
  } catch (error) {
    console.error('ゲーム実況コメント生成エラー:', error)
    return null
  }
}

/**
 * AI応答から感情タグとテキストを解析する
 * 例: "[happy]すごい！" → { text: "すごい！", emotion: "happy" }
 */
function parseEmotionAndText(rawText: string): {
  text: string
  emotion: EmotionType
} {
  const emotionMatch = rawText.match(/^\s*\[(.*?)\]/)

  if (emotionMatch?.[1]) {
    const emotionStr = emotionMatch[1].toLowerCase()
    const emotion: EmotionType = (EMOTIONS as readonly string[]).includes(
      emotionStr
    )
      ? (emotionStr as EmotionType)
      : 'neutral'
    const text = rawText
      .slice(rawText.indexOf(emotionMatch[0]) + emotionMatch[0].length)
      .replace(/\[.*?\]/g, '') // 途中の感情タグも除去
      .trim()

    return { text: text || rawText.replace(/\[.*?\]/g, '').trim(), emotion }
  }

  return { text: rawText.replace(/\[.*?\]/g, '').trim(), emotion: 'neutral' }
}
