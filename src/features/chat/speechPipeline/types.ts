/**
 * ストリーミング応答パイプラインの型定義
 *
 * 設計ドキュメント: docs/streaming-pipeline-design.md
 */

/**
 * SpeechSegmenter が発行するイベント。
 * - display: chatLogへ追記する生テキスト（タグ含む・コード内容含まず）
 * - speech: 発話単位として確定した文（タグは抽出済み）
 * - code: 完結したコードブロック（メッセージ境界を含意する）
 */
export type SegmenterEvent =
  | { kind: 'display'; text: string }
  | {
      kind: 'speech'
      text: string
      emotionTag: string
      motionTag?: string
      /**
       * このイベントの文の直前にタグが明示的に出現したか。
       * falseなら持ち越し（C4）によるタグ。正規化表示
       * （NormalizedMessageLogWriter）はtrueの場合のみタグを表示に含める。
       */
      emotionTagExplicit?: boolean
    }
  | { kind: 'code'; content: string }

export type SpeechEvent = Extract<SegmenterEvent, { kind: 'speech' }>
