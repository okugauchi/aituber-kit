import { logger } from '@/lib/logger'
import { Talk } from './messages'
import homeStore from '@/features/stores/home'
import { getCharacterRenderer } from './characterRenderer'

type SpeakTask = {
  sessionId: string
  audioBuffer: ArrayBuffer
  talk: Talk
  isNeedDecode: boolean
  onComplete?: () => void
}

export class SpeakQueue {
  private static readonly QUEUE_CHECK_DELAY = 1500
  private queue: SpeakTask[] = []
  private isProcessing = false
  private currentSessionId: string | null = null
  private static speakCompletionCallbacks: (() => void)[] = []
  private static _instance: SpeakQueue | null = null
  private stopped = false
  private static stopTokenCounter = 0
  // 直近の停止の対象範囲（'all' = 全体停止 / それ以外 = 対象セッションID）。
  // speechDispatcher が「他セッション向けの停止に巻き添えされない」判定に使う
  // 読み取り専用の付帯情報で、キュー自体の制御には使用しない。
  private static stopScope: 'all' | string = 'all'

  public static get currentStopToken() {
    return SpeakQueue.stopTokenCounter
  }

  public static get currentStopScope(): 'all' | string {
    return SpeakQueue.stopScope
  }

  // 発話完了時のコールバックを登録
  static onSpeakCompletion(callback: () => void) {
    SpeakQueue.speakCompletionCallbacks.push(callback)
  }

  // 発話完了時のコールバックを削除
  static removeSpeakCompletionCallback(callback: () => void) {
    SpeakQueue.speakCompletionCallbacks =
      SpeakQueue.speakCompletionCallbacks.filter((cb) => cb !== callback)
  }

  /**
   * キューのグローバルインスタンスを取得します。
   */
  public static getInstance(): SpeakQueue {
    if (!SpeakQueue._instance) {
      SpeakQueue._instance = new SpeakQueue()
    }
    return SpeakQueue._instance
  }

  private static stopCurrentModelSpeaking() {
    getCharacterRenderer()?.stopSpeaking()
  }

  /**
   * 現在の発話だけを停止し、待機キューは残します。
   */
  public static stopCurrentSpeech() {
    SpeakQueue.stopCurrentModelSpeaking()
  }

  /**
   * 待機キューだけをクリアし、現在の発話は継続します。
   */
  public static stopQueue() {
    SpeakQueue.getInstance().clearQueue()
  }

  /**
   * すべての発話を停止し、キューをクリアします。
   * Stop ボタンから呼び出されます。
   */
  public static stopAll() {
    const instance = SpeakQueue.getInstance()
    instance.stopped = true
    // 発話キューの処理状態をリセットして次回の再生を可能にする
    instance.isProcessing = false
    SpeakQueue.stopTokenCounter++
    SpeakQueue.stopScope = 'all'
    instance.clearQueue()
    SpeakQueue.stopCurrentModelSpeaking()
    homeStore.setState({ isSpeaking: false })
  }

  /**
   * 指定セッションの発話だけを停止します。
   * 現在の発話セッションが一致しない場合は、キュー内の該当タスクだけを破棄します。
   */
  public static stopSession(sessionId: string | null) {
    if (!sessionId) return

    const instance = SpeakQueue.getInstance()
    instance.queue = instance.queue.filter(
      (task) => task.sessionId !== sessionId
    )

    if (instance.currentSessionId !== sessionId) {
      return
    }

    instance.stopped = true
    instance.isProcessing = false
    SpeakQueue.stopTokenCounter++
    SpeakQueue.stopScope = sessionId
    instance.clearQueue()

    SpeakQueue.stopCurrentModelSpeaking()
    homeStore.setState({ isSpeaking: false })
  }

  /**
   * キューが完全に空転している場合のみ、発話完了コールバックの実行と
   * 表情のリセットを行います。停止により発話が打ち切られた応答の
   * ストリーム終端処理（speechDispatcher が disabled になった場合）から
   * 呼び出されます。新しい応答が既に発話中（isSpeaking）の場合は何もしません。
   */
  public static async finalizeIfIdle(): Promise<void> {
    const instance = SpeakQueue.getInstance()
    if (
      instance.queue.length > 0 ||
      instance.isProcessing ||
      homeStore.getState().isSpeaking
    ) {
      return
    }

    let shouldResumeQueue = false
    instance.isProcessing = true
    try {
      instance.stopped = false
      SpeakQueue.speakCompletionCallbacks.forEach((callback) => {
        try {
          callback()
        } catch (error) {
          logger.error(
            '発話完了コールバックの実行中にエラーが発生しました:',
            error
          )
        }
      })

      if (instance.queue.length > 0 || homeStore.getState().isSpeaking) {
        shouldResumeQueue =
          instance.queue.length > 0 && homeStore.getState().isSpeaking
      } else {
        await getCharacterRenderer()?.resetToIdle()
      }
    } finally {
      instance.isProcessing = false
    }

    if (shouldResumeQueue) {
      await instance.processQueue()
    }
  }

  async addTask(task: SpeakTask) {
    this.queue.push(task)
    // キューにタスクが追加された時点で発話中フラグを立てる
    homeStore.setState({ isSpeaking: true })
    await this.processQueue()
  }

  private async processQueue() {
    // 既に別の processQueue が動作中の場合は新たに起動しない
    if (this.isProcessing) return

    // Stop ボタンが押された後に再開されたかどうかを判定するためのトークンをキャプチャ
    const startToken = SpeakQueue.currentStopToken

    // 停止中は処理しない
    if (this.stopped) {
      this.clearQueue()
      return
    }

    this.isProcessing = true
    const hs = homeStore.getState()

    // isSpeaking はループ内部で最新値を参照するため、ここでは条件に含めない
    while (this.queue.length > 0) {
      // StopAll() によりトークンが変化していたら直ちに処理を中断
      if (startToken !== SpeakQueue.currentStopToken) {
        logger.log('Stop token changed. Abort current queue processing.')
        break
      }

      const currentState = homeStore.getState()
      if (!currentState.isSpeaking) {
        this.clearQueue()
        homeStore.setState({ isSpeaking: false })
        break
      }

      const task = this.queue.shift()
      if (task) {
        if (task.sessionId !== this.currentSessionId) {
          // 旧セッションのタスクは破棄
          continue
        }
        try {
          const { audioBuffer, talk, isNeedDecode, onComplete } = task
          await getCharacterRenderer()?.speak(audioBuffer, talk, isNeedDecode)
          onComplete?.()
        } catch (error) {
          logger.error(
            'An error occurred while processing the speech synthesis task:',
            error
          )
          if (error instanceof Error) {
            logger.error('Error details:', error.message)
          }
        }
      }
    }

    // 処理を完全に終える、またはトークン変化で中断した場合どちらでも isProcessing を解除
    this.isProcessing = false

    // トークンが変化して中断された場合は後続処理を行わずに終了
    if (startToken !== SpeakQueue.currentStopToken) {
      return
    }

    this.scheduleNeutralExpression()
    if (!hs.chatProcessing) {
      this.clearQueue()
    }
  }

  private async scheduleNeutralExpression() {
    const initialLength = this.queue.length
    await new Promise((resolve) =>
      setTimeout(resolve, SpeakQueue.QUEUE_CHECK_DELAY)
    )

    if (this.shouldResetToNeutral(initialLength)) {
      await getCharacterRenderer()?.resetToIdle()
    }
  }

  private shouldResetToNeutral(initialLength: number): boolean {
    const isComplete =
      initialLength === 0 && this.queue.length === 0 && !this.isProcessing

    // 発話完了時にコールバックを呼び出す
    if (isComplete) {
      logger.log('🎤 発話が完了しました。登録されたコールバックを実行します。')
      // 発話完了時に isSpeaking を必ず false に設定
      homeStore.setState({ isSpeaking: false })
      // 停止フラグもリセットして次回の動作に備える
      this.stopped = false
      // すべての発話完了コールバックを呼び出す
      SpeakQueue.speakCompletionCallbacks.forEach((callback) => {
        try {
          callback()
        } catch (error) {
          logger.error(
            '発話完了コールバックの実行中にエラーが発生しました:',
            error
          )
        }
      })
    }

    return isComplete
  }

  clearQueue(shouldCallOnComplete = false) {
    if (shouldCallOnComplete) {
      this.queue.forEach((task) => task.onComplete?.())
    }
    this.queue = []
  }

  private resetStoppedState() {
    this.stopped = false
    homeStore.setState({ isSpeaking: true })
  }

  checkSessionId(sessionId: string) {
    // 停止中の場合はセッションIDに関わらず再開する
    if (this.stopped) {
      this.currentSessionId = sessionId
      // 念のためキューをクリア（Stop 時点で空だが保険）
      this.clearQueue()
      this.resetStoppedState()
      return
    }

    // 通常時にセッションIDが変わった場合はキューをリセット
    if (this.currentSessionId !== sessionId) {
      this.currentSessionId = sessionId
      this.clearQueue(true)
      homeStore.setState({ isSpeaking: true })
    }
  }

  // インスタンスが停止状態かどうか
  public isStopped(): boolean {
    return this.stopped
  }
}
