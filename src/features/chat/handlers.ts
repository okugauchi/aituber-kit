/**
 * チャット応答処理の公開API（後方互換ファサード）
 *
 * 実装は以下へ分割されている（設計: docs/streaming-pipeline-design.md §3）:
 * - speechPipeline/ ... ストリーミング応答の状態機械・表示・発話パイプライン
 * - sendChatHandler.ts ... チャット入力の振り分け（外部連携/realtime/通常/スライド）
 * - externalLinkageReceiver.ts ... 外部連携WebSocket受信
 * - realtimeReceiver.ts ... Realtime API受信
 */
export { processAIResponse } from './speechPipeline/processAIResponse'
export { speakMessageHandler } from './speechPipeline/speakMessageHandler'
export { handleSendChatFn } from './sendChatHandler'
export { handleReceiveTextFromWsFn } from './externalLinkageReceiver'
export { handleReceiveTextFromRtFn } from './realtimeReceiver'
