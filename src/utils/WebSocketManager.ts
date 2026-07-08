import { logger } from '@/lib/logger'
import toastStore from '@/features/stores/toast'
import settingsStore from '@/features/stores/settings'

type TranslationFunction = (
  key: string,
  options?: Record<string, unknown>
) => string

export type WebSocketConnector = () =>
  | WebSocket
  | null
  | Promise<WebSocket | null>

export class WebSocketManager {
  private ws: WebSocket | null = null
  private connectGeneration = 0
  private t: TranslationFunction
  private isTextBlockStarted: boolean = false
  private handlers: {
    onOpen: (event: Event) => void
    onMessage: (event: MessageEvent) => Promise<void>
    onError: (event: Event) => void
    onClose: (event: Event) => void
  }
  private connectWebsocket: WebSocketConnector

  constructor(
    t: TranslationFunction,
    handlers: {
      onOpen: (event: Event) => void
      onMessage: (event: MessageEvent) => Promise<void>
      onError: (event: Event) => void
      onClose: (event: Event) => void
    },
    connectWebsocket: WebSocketConnector
  ) {
    this.t = t
    this.handlers = handlers
    this.connectWebsocket = connectWebsocket
  }

  private handleOpen = (event: Event) => {
    logger.log('WebSocket connection opened:', event)
    this.removeToast()
    toastStore.getState().addToast({
      message: this.t('Toasts.WebSocketConnectionSuccess'),
      type: 'success',
      duration: 3000,
      tag: 'websocket-connection-success',
    })
    this.handlers.onOpen(event)
  }

  private handleMessage = async (event: MessageEvent) => {
    logger.log('WebSocket received message:', event)
    await this.handlers.onMessage(event)
  }

  private handleError = (event: Event) => {
    logger.error('WebSocket error:', event)
    this.removeToast()
    toastStore.getState().addToast({
      message: this.t('Toasts.WebSocketConnectionError'),
      type: 'error',
      duration: 5000,
      tag: 'websocket-connection-error',
    })
    this.handlers.onError(event)
  }

  private handleClose = (event: Event) => {
    logger.log('WebSocket connection closed:', event)
    this.ws = null
    this.removeToast()
    toastStore.getState().addToast({
      message: this.t('Toasts.WebSocketConnectionClosed'),
      type: 'error',
      duration: 3000,
      tag: 'websocket-connection-close',
    })
    this.handlers.onClose(event)
  }

  public async connect() {
    const generation = ++this.connectGeneration
    this.removeToast()
    toastStore.getState().addToast({
      message: this.t('Toasts.WebSocketConnectionAttempt'),
      type: 'info',
      duration: 10000,
      tag: 'websocket-connection-info',
    })

    try {
      const socketOrPromise = this.connectWebsocket()
      const ws =
        socketOrPromise instanceof Promise
          ? await socketOrPromise
          : socketOrPromise
      if (generation !== this.connectGeneration) {
        ws?.close()
        return
      }
      this.ws = ws
    } catch (error) {
      logger.error('WebSocket connection setup failed:', error)
      this.handleError(new Event('error'))
      return
    }

    if (!this.ws) return

    this.ws.addEventListener('open', this.handleOpen)
    this.ws.addEventListener('message', this.handleMessage)
    this.ws.addEventListener('error', this.handleError)
    this.ws.addEventListener('close', this.handleClose)
  }

  public removeToast() {
    toastStore.getState().removeToast('websocket-connection-error')
    toastStore.getState().removeToast('websocket-connection-success')
    toastStore.getState().removeToast('websocket-connection-close')
    toastStore.getState().removeToast('websocket-connection-info')
  }

  public disconnect() {
    this.connectGeneration++
    if (this.ws) {
      const ws = this.ws
      this.ws = null
      ws.close()
    }
  }

  public get websocket(): WebSocket | null {
    return this.ws
  }

  public get textBlockStarted(): boolean {
    return this.isTextBlockStarted
  }

  setTextBlockStarted(value: boolean) {
    this.isTextBlockStarted = value
  }

  public reconnect(): boolean {
    const ss = settingsStore.getState()
    if (!ss.realtimeAPIMode || !ss.selectAIService) return false

    this.disconnect()
    this.connect()

    return true
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
}
