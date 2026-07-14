import { Message } from '@/features/messages/messages'
import settingsStore from '@/features/stores/settings'
import { isMultiModalAvailable } from '@/features/constants/aiModels'

/**
 * custom-api モードのとき、judgeSlide は /api/ai/custom/ 経由では
 * なく、oMLX (9000) を直接呼ぶ。Gateway (8642) はエージェント処理で
 * 遅延するため、スライド判定のような軽量タスクには oMLX を使う。
 */
async function directCustomApiRequest(
  messages: Message[],
): Promise<string> {
  const url = 'http://127.0.0.1:9000/v1/chat/completions'

  const apiBody = JSON.stringify({
    model: 'gemma-4-12B-it-8bit',
    messages,
    stream: false,
    max_tokens: 512,
  })

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: apiBody,
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      return '{"judge": "false", "page": ""}'
    }
    const data = await res.json()
    const rawContent = data.choices?.[0]?.message?.content || data.content || data.text || '{"judge": "false", "page": ""}'
    // oMLX は JSON をマークダウンコードブロックで包む場合があるので抽出する
    // 最初の `{` から最後の `}` までを抽出
    const braceStart = rawContent.indexOf('{')
    const braceEnd = rawContent.lastIndexOf('}')
    if (braceStart !== -1 && braceEnd > braceStart) {
      return rawContent.slice(braceStart, braceEnd + 1)
    }
    return rawContent
  } catch {
    return '{"judge": "false", "page": ""}'
  }
}

export const judgeSlide = async (
  queryText: string,
  scripts: string,
  supplement: string
): Promise<string> => {
  const ss = settingsStore.getState()
  const aiService = ss.selectAIService
  const aiModel = ss.selectAIModel
  const enableMultiModal = ss.enableMultiModal

  // 現在選択されているモデルがマルチモーダル使用可能かチェック
  if (!isMultiModalAvailable(aiService, aiModel, enableMultiModal)) {
    throw new Error('Selected model does not support multimodal features')
  }

  const systemMessage = `
You are an AI tasked with determining whether a user's comment is a question about a given script document and supplementary text, and if so, which page of the document is most relevant to the question. Follow these instructions carefully:

1. You will be provided with a user's comment, a script document, and supplementary text. The script document is structured as a JSON array, where each object represents a page with "page", "line", and "supplement" fields. The supplementary text consists of a string.

2. Analyze the user's comment.

3. Determine if the comment is a question about the script document or the supplementary text. Consider the content and context of the comment in relation to the document's subject matter. Note that supplementary text may not always be present.

4. If the comment is a question about the script document:
   a. Review each page of the document to find the most relevant information.
   b. Determine which page contains information that best answers or relates to the user's question.
   c. Set the "judge" value to "true" and the "page" value to the number of the most relevant page.

5. If the comment is a question about the supplementary text:
   a. Set the "judge" value to "true" and the "page" value to an empty string.

6. If the comment is not a question about either the script document or the supplementary text:
   a. Set the "judge" value to "false" and the "page" value to an empty string.

7. Provide your answer in JSON format as follows:
   {"judge": "true/false", "page": "number/empty string"}

Here is the content of the script document:
<document>
${scripts}
</document>

Here is the content of the supplementary text:
<document>
${supplement}
</document>

Based on the user's comment and the content of both the script document and supplementary text, provide "only" your final answer in the specified JSON format.
`

  // custom-api モードでは /api/ai/custom/ を経由せず直接上流 API を呼ぶ
  if (aiService === 'custom-api') {
    return await directCustomApiRequest([
      { role: 'system', content: systemMessage },
      { role: 'user', content: queryText },
    ])
  }

  // 通常モードは既存の Vercel AI SDK 経由
  const { getVercelAIChatResponse } = await import(
    '@/features/chat/vercelAIChat'
  )
  const response = await getVercelAIChatResponse([
    { role: 'system', content: systemMessage },
    { role: 'user', content: queryText },
  ])
  return response.text
}
