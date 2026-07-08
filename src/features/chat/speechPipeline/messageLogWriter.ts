import homeStore from '@/features/stores/home'
import { Message } from '@/features/messages/messages'
import { generateMessageId } from '@/utils/messageUtils'
import { SegmenterEvent, SpeechEvent } from './types'

export type UpsertMessageFn = (message: Message) => void

const defaultUpsert: UpsertMessageFn = (message) =>
  homeStore.getState().upsertMessage(message)

/**
 * ストリーミング応答（processAIResponse）用のchatLog書き込み。
 *
 * 現行挙動の踏襲（設計§5.1）:
 * - 最初のupsertは最初の非空テキストまたはthinkingチャンクで発生
 * - 中間upsertは非トリム、終端の最終upsertはトリム済み
 * - コードブロックはIDなしの `role: 'code'` メッセージとしてupsertし、
 *   以降のテキストは新しいメッセージIDで表示する
 */
export class MessageLogWriter {
  private currentMessageId: string | null = null
  private content = ''
  private thinking = ''

  constructor(private upsert: UpsertMessageFn = defaultUpsert) {}

  appendThinking(chunk: string) {
    this.thinking += chunk
    if (this.currentMessageId === null) {
      this.currentMessageId = generateMessageId()
    }
    this.upsert({
      id: this.currentMessageId,
      role: 'assistant',
      content: this.content || '',
      thinking: this.thinking,
    })
  }

  appendDisplay(text: string) {
    if (!text) return
    if (this.currentMessageId === null) {
      this.currentMessageId = generateMessageId()
    }
    this.content += text
    this.upsert({
      id: this.currentMessageId,
      role: 'assistant',
      content: this.content,
      ...(this.thinking && { thinking: this.thinking }),
    })
  }

  appendCodeBlock(content: string) {
    if (content.trim()) {
      this.upsert({ role: 'code', content })
    }
    // コードブロック境界で新しいアシスタントメッセージを開始（D3の修正）
    this.currentMessageId = generateMessageId()
    this.content = ''
  }

  /** 終端処理。記憶保存に使う最終メッセージ内容（トリム済み）を返す */
  finalize(): string {
    const trimmed = this.content.trim()
    if (trimmed) {
      this.upsert({
        id: this.currentMessageId ?? generateMessageId(),
        role: 'assistant',
        content: trimmed,
        ...(this.thinking && { thinking: this.thinking }),
      })
    }
    return trimmed
  }
}

/**
 * 完成テキスト（speakMessageHandler）用のchatLog書き込み。
 *
 * 現行のspeakMessageHandlerは表示を生テキストではなく
 * `${emotionTag} ${sentence}` のスペース結合（モーションタグは表示から除外）で
 * 再構成するため、その形式を保存する（設計§5.1 / レビューM4）。
 */
export class NormalizedMessageLogWriter {
  private currentMessageId = generateMessageId()
  private accumulated = ''

  constructor(private upsert: UpsertMessageFn = defaultUpsert) {}

  handleEvent(event: SegmenterEvent) {
    if (event.kind === 'speech') {
      this.appendSpeech(event)
    } else if (event.kind === 'code') {
      this.appendCodeBlock(event.content)
    }
    // displayイベントは使用しない（speechイベントから正規化形式を再構成する）
  }

  private appendSpeech(event: SpeechEvent) {
    // 持ち越し（C4）による暗黙タグは表示に含めない。タグが文頭に
    // 明示的に現れた文のみプレフィックスする（旧speakMessageHandlerと同形式）
    const showTag = event.emotionTag && event.emotionTagExplicit
    const aiText = showTag ? `${event.emotionTag} ${event.text}` : event.text
    this.accumulated += aiText + ' '
  }

  private appendCodeBlock(content: string) {
    this.flushAccumulated()
    if (content.trim()) {
      this.upsert({
        id: generateMessageId(),
        role: 'code',
        content,
      })
    }
    this.currentMessageId = generateMessageId()
  }

  finalize() {
    this.flushAccumulated()
  }

  private flushAccumulated() {
    const trimmed = this.accumulated.trim()
    if (trimmed) {
      this.upsert({
        id: this.currentMessageId,
        role: 'assistant',
        content: trimmed,
      })
      this.accumulated = ''
    }
  }
}
