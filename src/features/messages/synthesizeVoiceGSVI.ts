import { Talk } from './messages'
import { synthesizeVoiceApi } from './synthesizeVoiceApi'

export async function synthesizeVoiceGSVIApi(
  talk: Talk,
  url: string,
  character: string,
  batchsize: number,
  speed: number
): Promise<ArrayBuffer> {
  const style = 'default'

  return synthesizeVoiceApi(
    url.replace(/\/$/, ''),
    {
      character: character,
      emotion: style,
      text: talk.message,
      batch_size: batchsize,
      speed: speed.toString(),
      stream: true,
    },
    'GSVI',
    {
      parseResponse: async (res) => {
        const blob = await res.blob()
        return blob.arrayBuffer()
      },
    }
  )
}
