# audioモード認証アーキテクチャ再構築 設計ドキュメント

作成日: 2026-07-08（作業単位6 / F3）
改訂: v2 — コード突合レビューのBlocker 1件（pairsルートでのgate.guardServerSecret誤用）・Major 2件（WAFフィクスチャ更新、NDJSONアンチバッファリング）を反映

## 1. 課題

`src/features/chat/openAIAudioChat.ts:26` が `dangerouslyAllowBrowser: true` でブラウザから直接OpenAI APIを呼んでおり、サーバーのセキュリティモデル（F1の統一アクセスポリシー）を丸ごと迂回している。

- 他の全プロバイダーが `/api/ai/vercel` + `guardServerSecretAccess` 経由なのに対し、audioモードだけサーバー側 `OPENAI_API_KEY` が使えない
- そのため demoモードで提供不可、レート制限ゼロ
- クライアントに平文APIキーが必須（`ss.openaiKey`）

## 2. 設計方針

**サーバー中継方式**を採用する。`/api/ai/vercel` と同じ構造の新ルート `/api/ai/audio` を追加し、audioモードのチャット呼び出しをF1のポリシーモデル配下に入れる。

ephemeralセッショントークン方式は不採用: audioモードはWebSocketではなく通常のHTTPストリーミング（chat.completions + `modalities: ['text','audio']`）であり、中継にプロトコル上の障害がない。中継のほうがWAF・ガード・レート制限が既存機構でそのまま効く。

### スコープ外

- **Realtime APIモード（WebSocket）**: `useRealtimeAPI.tsx` はブラウザから `wss://api.openai.com/v1/realtime` へ `openai-insecure-api-key.<key>` サブプロトコルで直結しており、サーバー中継にはephemeralトークン発行（`POST /v1/realtime/sessions`）が必要。これはHTTP中継と全く別の設計であり、function calling・PCM16双方向ストリーミングを壊すリスクが高いため本タスクから除外し、フォローアップとする（ロードマップF3の完了条件はaudioモードのみを要求）。
- UI変更なし: audioモードのトグル（`OpenAIConfig.tsx`）はAPIキー入力に依存していないため、そのまま「クライアントキー未入力+サーバーキー有り」で動作可能になる。

## 3. サーバー側: `/api/ai/audio`

Pages Router（Node.jsランタイム）。`withAccessPolicy` でラップ。

```
POST /api/ai/audio
body: { messages, apiKey?, model?, voice? }
```

- キー解決: `body.apiKey` → `process.env.OPENAI_KEY` → `process.env.OPENAI_API_KEY`（`/api/ai/vercel` の openai 分岐と同一の解決順）
- サーバー秘匿ガードは **`secret.kind: 'pairs'` 宣言によりラッパー（withAccessPolicy）がハンドラー実行前に自動で評価する**。ハンドラーが `gate.guardServerSecret()` を呼んではならない（dynamicルート専用APIでthrowする。既存pairsルート `/api/openAITTS` 等と同じ書き方に従う）
- キーが最終的に空なら 400 `EmptyAPIKey`（vercel.ts と同一コード）。`model` 未指定はサーバー側でも `defaultModels.openaiAudio` にフォールバック（クライアント側フォールバックも現行維持）
- OpenAI SDKをサーバー側で使用（`dangerouslyAllowBrowser` なし）し、`chat.completions.create({ stream: true, modalities: ['text','audio'], audio: { voice, format: 'pcm16' } })`
- レスポンスは **NDJSON**（1行1 JSON）。各チャンクの `delta.audio`（`transcript` / `data` / `id`）のみを転送する
- アンチバッファリング（レビューM2）: Next本番サーバーのgzip圧縮によるバッファリングを避けるため、`Content-Type: application/x-ndjson` / `Cache-Control: no-cache` に加えて `X-Accel-Buffering: no` を設定し、ループ前に `res.flushHeaders()`、各 `res.write` 後に `(res as any).flush?.()` を呼ぶ（`pipeResponse.ts` のSSE対応と同じ手法。`flush` はCloudflare/OpenNextランタイムには存在しないためoptional呼び出しにする）
- Cloudflare Workers（demoサイト）: `openai` パッケージは既にサーバー側で使用実績があり（whisper.ts等、`serverExternalPackages` 登録済み）、`/api/ai/vercel` が同デプロイでストリーミング実績を持つため、`res.write` ベースのNDJSONは動作可能
- クライアント切断時は `req` の `close` イベントで上流を `AbortController` 中断（コスト保護）
- 上流エラーは 500 `AIAPIError`（ストリーム開始前）。ストリーム開始後のエラーは接続を終了する

### routePolicies 宣言

```ts
'/api/ai/audio': {
  path: '/api/ai/audio',
  featureName: 'ai/audio',
  methods: ['POST'],
  resources: ['server-secret'],
  secret: {
    kind: 'pairs',
    pairs: [
      { source: 'body', key: 'apiKey', envVars: ['OPENAI_KEY', 'OPENAI_API_KEY'] },
    ],
  },
  restrictedBehavior: 'none',
  waf: { embedAllowed: true },   // /api/ai/vercel と同等（embed/demoで使用可能に）
}
```

- `secret.kind: 'pairs'` で宣言的に表現できる（vercel.ts がdynamicなのはサービス名からenv名を動的合成するため。audioはopenai固定なのでpairsで足りる）
- WAFルールは既存の生成スクリプトが routePolicies から自動導出する
- ルート追加はF1の静的テスト（ポリシー未登録検出・resources検証）が自動で検査する

## 4. クライアント側: `openAIAudioChat.ts`

- OpenAI SDKの直接呼び出しを `fetch('/api/ai/audio')` に置換。`dangerouslyAllowBrowser` を排除
- リクエストに `apiKey: ss.openaiKey`（未入力なら空 → サーバーenvにフォールバック）、`model`、`voice` を含める
- `!res.ok` は従来同様 throw（呼び出し元 `processAIResponse` がログ・chatProcessing解除を行う既存パス）
- NDJSON行をパースし、従来と同一のダウンストリーム処理を維持:
  - `transcript` → `controller.enqueue`（テキストストリーム）
  - `data` → `base64ToArrayBuffer` → `AudioBufferManager.addData`（PCM16再生）
  - `id` → `homeStore.upsertMessage`（audio.id によるメッセージ更新）
- `options.signal` は fetch へ渡し、読み取りループ中の abort チェックも維持。AbortError はそのまま rethrow（現行踏襲）

## 5. 意図的挙動変更

| #   | 変更                                                                                                                                       | 種別                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| A1  | audioモードがサーバー側 `OPENAI_KEY`/`OPENAI_API_KEY` で動作可能になり、demoモード（ガードの `demo` 分岐 + WAF embed許可）で提供可能になる | 機能改善（F3の完了条件） |
| A2  | ブラウザからOpenAIへの直接接続がなくなり、自ホスト経由になる（1ホップ追加。音声データ量はOpenAIのSSEと同等のbase64 NDJSON）                | アーキテクチャ変更       |
| A3  | クライアント入力キーは従来どおり利用可能（bodyで中継、`usesServerSecret = false` 扱い）                                                    | 不変                     |
| A4  | Realtime APIモードは変更なし                                                                                                               | 不変                     |

## 6. テスト

1. **新ルートテスト** `src/__tests__/pages/api/ai-audio.test.ts`（`vercel.test.ts` をテンプレートに）: 成功パス（NDJSON形式・audio差分のみ転送）/ キー欠落400 / サーバーキー使用時のガード発動（`mockServerSecretGuard` ヘルパー）/ 上流エラー500 / メソッド検査
2. **クライアントテスト更新** `openAIAudioChat.test.ts`: OpenAI SDKモックを fetch + NDJSONモックへ置換。既存アサーション（transcript enqueue / addData / audio.id upsert / AbortSignal / エラーrethrow）の意味は維持
3. F1の静的テスト群（ポリシー登録・resources検証）が自動で新ルートを検査
4. **WAF等価性テストのフィクスチャ更新**（レビューM1）: `generateWafRules.test.ts` の `LEGACY_RULES` はembed許可パスをハードコードしているため、`/api/ai/audio` を含む形へ更新する。あわせて `.github/workflows/apply-cloudflare-waf.yml` は `workflow_dispatch` 起動のため、**マージ後に手動実行しないと本番WAFに新ルールが反映されない**ことをデプロイ手順として明記する
5. 全テスト・lint・tsc・build通過
