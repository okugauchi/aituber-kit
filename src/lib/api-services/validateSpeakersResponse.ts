export interface SpeakerStyleResponse {
  name: string
  id: number
  type: string
}

export interface SpeakerResponse {
  name: string
  speaker_uuid: string
  styles: SpeakerStyleResponse[]
}

export async function validateSpeakersResponse(
  response: Response,
  serverName: string
): Promise<SpeakerResponse[]> {
  if (!response.ok) {
    throw new Error(
      `${serverName} server responded with status: ${response.status}`
    )
  }

  const speakers: unknown = await response.json()
  if (!Array.isArray(speakers)) {
    throw new Error(`${serverName} speakers response must be an array`)
  }

  return speakers as SpeakerResponse[]
}
