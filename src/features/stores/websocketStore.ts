import { create } from 'zustand'
import type { TFunction } from 'i18next'
import {
  WebSocketManager,
  type WebSocketConnector,
} from '@/utils/WebSocketManager'
import { TmpMessage } from '@/components/realtimeAPIUtils'

interface WebSocketState {
  wsManager: WebSocketManager | null
  initializeWebSocket: (
    t: TFunction,
    handlers: {
      onOpen?: (event: Event) => void
      onMessage?: (event: MessageEvent) => Promise<void>
      onError?: (event: Event) => void
      onClose?: (event: Event) => void
    },
    connectWebsocket: WebSocketConnector
  ) => void
  disconnect: () => void
  reconnect: () => boolean
}

const webSocketStore = create<WebSocketState>((set, get) => ({
  wsManager: null,
  initializeWebSocket: (t, handlers = {}, connectWebsocket) => {
    const defaultHandlers = {
      onOpen: (event: Event) => {},
      onMessage: async (event: MessageEvent) => {},
      onError: (event: Event) => {},
      onClose: (event: Event) => {},
      ...handlers,
      connectWebsocket,
    }
    const manager = new WebSocketManager(t, defaultHandlers, connectWebsocket)
    manager.connect()
    set({ wsManager: manager })
  },
  disconnect: () => {
    const { wsManager } = get()
    wsManager?.disconnect()
    set({ wsManager: null })
  },
  reconnect: () => {
    const { wsManager } = get()
    return wsManager ? wsManager.reconnect() : false
  },
}))

export default webSocketStore
