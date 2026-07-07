import { logger } from '@/lib/logger'
import { Message } from '@/features/messages/messages'
import { NextResponse } from 'next/server'

/**
 * base64データURLからMIMEタイプを抽出する
 * @param dataUrl base64データURL (例: "data:image/png;base64,...")
 * @returns MIMEタイプ (例: "image/png") または null
 */
function extractMimeTypeFromDataUrl(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:([^;]+);base64,/)
  const mimeType = match ? match[1] : null

  // MIMEタイプが画像形式であることを検証
  if (mimeType && !mimeType.startsWith('image/')) {
    return null
  }

  return mimeType
}

/**
 * メッセージ内の画像オブジェクトにmimeTypeを追加する
 * @param messages 処理するメッセージ配列
 * @returns mimeTypeが追加されたメッセージ配列
 */
function processMessagesWithMimeType(messages: Message[]): any[] {
  return messages.map((message) => {
    if (
      message.content &&
      Array.isArray(message.content) &&
      message.content.some((content: any) => content.type === 'image')
    ) {
      return {
        ...message,
        content: message.content.map((content: any) => {
          if (content.type === 'image' && content.image) {
            const mimeType = extractMimeTypeFromDataUrl(content.image)
            return mimeType
              ? {
                  ...content,
                  mimeType,
                }
              : content
          }
          return content
        }),
      }
    }
    return message
  })
}

const VALID_HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

function normalizeHeaderName(value: string): string {
  return value
    .trim()
    .replace(/\\+"/g, '"')
    .replace(/^[{\\'"]+/, '')
    .replace(/[}\\'"]+$/, '')
    .trim()
}

function normalizeHeaderValue(value: unknown): string {
  return String(value)
    .trim()
    .replace(/\\+"/g, '"')
    .replace(/^[\\'"]+/, '')
    .replace(/[\\'"]+$/, '')
    .trim()
}

function normalizeParsedHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    return {}
  }

  const normalized: Record<string, string> = {}
  for (const [rawKey, rawValue] of Object.entries(headers)) {
    const headerName = normalizeHeaderName(rawKey)
    if (!VALID_HEADER_NAME.test(headerName)) {
      logger.warn('Skipping invalid Custom API header name')
      continue
    }

    normalized[headerName] = normalizeHeaderValue(rawValue)
  }

  return normalized
}

function isAnthropicApiUrl(customApiUrl: string): boolean {
  try {
    return new URL(customApiUrl).hostname === 'api.anthropic.com'
  } catch (error) {
    return false
  }
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lowerName = name.toLowerCase()
  return Object.keys(headers).some((key) => key.toLowerCase() === lowerName)
}

function getHeader(headers: Record<string, string>, name: string): string {
  const lowerName = name.toLowerCase()
  const headerName = Object.keys(headers).find(
    (key) => key.toLowerCase() === lowerName
  )

  return headerName ? headers[headerName] : ''
}

function removeHeader(headers: Record<string, string>, name: string) {
  const lowerName = name.toLowerCase()
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lowerName) {
      delete headers[key]
    }
  }
}

function extractBearerToken(value: string): string {
  const bearerPrefix = 'Bearer '
  return value.startsWith(bearerPrefix)
    ? value.slice(bearerPrefix.length).trim()
    : value.trim()
}

function buildAnthropicHeaders(
  headers: Record<string, string>,
  fallbackApiKey = ''
): Record<string, string> {
  const anthropicHeaders = { ...headers }
  const xApiKey = getHeader(anthropicHeaders, 'x-api-key')
  const authorization = getHeader(anthropicHeaders, 'authorization')
  const apiKey =
    fallbackApiKey ||
    extractBearerToken(xApiKey) ||
    extractBearerToken(authorization) ||
    ''

  if (apiKey) {
    removeHeader(anthropicHeaders, 'authorization')
    removeHeader(anthropicHeaders, 'x-api-key')
    anthropicHeaders['x-api-key'] = apiKey
  }

  if (!hasHeader(anthropicHeaders, 'anthropic-version')) {
    anthropicHeaders['anthropic-version'] = '2023-06-01'
  }

  return anthropicHeaders
}

/**
 * カスタムAPIを使用して応答を取得する
 * @param messages メッセージ
 * @param customApiUrl カスタムAPIのURL
 * @param customApiHeaders カスタムAPIのヘッダー (JSON文字列)
 * @param customApiBody カスタムAPIのボディ (JSON文字列)
 * @param stream ストリーミングするかどうか
 * @param customApiIncludeMimeType 画像にmimeTypeを含めるかどうか
 */
export async function handleCustomApi(
  messages: Message[],
  customApiUrl: string,
  customApiHeaders: string,
  customApiBody: string,
  stream: boolean,
  customApiIncludeMimeType: boolean = false
) {
  // 強制的にストリーミングを有効にする
  stream = true

  let parsedHeaders: Record<string, string> = {}
  let parsedBody: Record<string, any> = {}

  try {
    parsedHeaders = normalizeParsedHeaders(JSON.parse(customApiHeaders))
    parsedBody = JSON.parse(customApiBody)
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Invalid Headers or Body JSON',
        errorCode: 'InvalidJSON',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  let apiHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...parsedHeaders,
  }

  if (isAnthropicApiUrl(customApiUrl)) {
    apiHeaders = buildAnthropicHeaders(apiHeaders)
  }

  // customApiIncludeMimeTypeが有効な場合は画像にmimeTypeを追加
  const processedMessages = customApiIncludeMimeType
    ? processMessagesWithMimeType(messages)
    : messages

  // messagesをデフォルトでbodyに含める
  const apiBody = JSON.stringify({
    ...parsedBody,
    messages: processedMessages,
  })

  const requestInit = {
    method: 'POST',
    headers: apiHeaders,
    body: apiBody,
    signal: AbortSignal.timeout(180000), // 3分でタイムアウト
  }

  let apiResponse = await fetch(customApiUrl, requestInit)

  if (
    apiResponse.status === 401 &&
    isAnthropicApiUrl(customApiUrl) &&
    process.env.ANTHROPIC_API_KEY &&
    getHeader(apiHeaders, 'x-api-key') !== process.env.ANTHROPIC_API_KEY
  ) {
    logger.warn('Retrying Custom API request with Anthropic x-api-key header')
    apiResponse = await fetch(customApiUrl, {
      ...requestInit,
      headers: buildAnthropicHeaders(apiHeaders, process.env.ANTHROPIC_API_KEY),
    })
  }

  if (!apiResponse.ok) {
    logger.error(
      `Custom API Error: Status ${apiResponse.status}, URL: ${customApiUrl}`
    )

    try {
      // エラーレスポンスの内容も可能であればログに出力
      const errorResponseText = await apiResponse.text()
      logger.error(`Error Response: ${errorResponseText}`)

      // レスポンスを再作成するため、新しいResponseオブジェクトを作成
      return new Response(
        JSON.stringify({
          error: `Custom API Error: ${apiResponse.status}`,
          errorCode: 'CustomAPIError',
        }),
        {
          status: apiResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    } catch (e) {
      logger.error('Failed to read error response body:', e)
      return new Response(
        JSON.stringify({
          error: `Custom API Error: ${apiResponse.status}`,
          errorCode: 'CustomAPIError',
        }),
        {
          status: apiResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  }

  if (stream) {
    const forwardMetadata =
      process.env.AITUBERKIT_FORWARD_CUSTOM_API_METADATA === 'true'

    // ストリーミングレスポンスを正規化して返す
    // SSEの行をVercel AI SDK形式（text-delta + delta）に変換する
    let buffer = ''
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const enqueueAllowedLine = (
      line: string,
      controller: TransformStreamDefaultController
    ) => {
      if (line.trim() === '') {
        controller.enqueue(encoder.encode('\n'))
        return
      }

      if (!line.startsWith('data:')) {
        if (forwardMetadata) {
          controller.enqueue(encoder.encode(line + '\n'))
        }
        return
      }

      const content = line.substring(5).trim()
      if (!content || content === '[DONE]') {
        controller.enqueue(encoder.encode(line + '\n'))
        return
      }

      try {
        const data = JSON.parse(content)

        // 既にVercel AI SDK形式（deltaフィールドあり）ならそのまま
        if (data.delta !== undefined) {
          if (forwardMetadata || data.type === 'text-delta') {
            controller.enqueue(encoder.encode(line + '\n'))
          }
          return
        }

        // payload.textフォーマットをdeltaフォーマットに変換
        if (data.payload?.text !== undefined) {
          const payloadType = data.type || 'text-delta'
          if (!forwardMetadata && payloadType !== 'text-delta') {
            return
          }
          const normalized = {
            type: forwardMetadata ? payloadType : 'text-delta',
            delta: data.payload.text,
          }
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(normalized)}\n`)
          )
          return
        }

        // OpenAI互換形式（choices[].delta.reasoning_content）の推論コンテンツ変換
        if (data.choices?.[0]?.delta?.reasoning_content !== undefined) {
          if (forwardMetadata) {
            const normalized = {
              type: 'reasoning-delta',
              delta: data.choices[0].delta.reasoning_content,
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(normalized)}\n`)
            )
          }
          // contentも同時に存在する場合があるのでフォールスルー
          if (data.choices[0].delta.content === undefined) {
            return
          }
        }

        // OpenAI互換形式（choices[].delta.content）の変換
        if (data.choices?.[0]?.delta?.content !== undefined) {
          const normalized = {
            type: 'text-delta',
            delta: data.choices[0].delta.content,
          }
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(normalized)}\n`)
          )
          return
        }

        // その他の形式はそのまま
        if (forwardMetadata) {
          controller.enqueue(encoder.encode(line + '\n'))
        }
      } catch {
        // JSONパース失敗時はそのまま
        if (forwardMetadata) {
          controller.enqueue(encoder.encode(line + '\n'))
        }
      }
    }

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true })
        const lines = buffer.split('\n')
        // 最後の要素は不完全な行の可能性があるのでバッファに残す
        buffer = lines.pop() || ''

        for (const line of lines) {
          enqueueAllowedLine(line, controller)
        }
      },
      flush(controller) {
        // 残りのバッファを処理
        if (buffer.trim()) {
          enqueueAllowedLine(buffer, controller)
        }
      },
    })

    if (!apiResponse.body) {
      return new Response(
        JSON.stringify({
          error: 'Empty response body from Custom API',
          errorCode: 'CustomAPIEmptyBody',
        }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(apiResponse.body.pipeThrough(transformStream), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } else {
    // 非ストリーミングレスポンス
    const data = await apiResponse.json()
    return new Response(
      JSON.stringify({
        text: data.text || data.content || JSON.stringify(data),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
