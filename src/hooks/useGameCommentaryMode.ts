import { useState, useEffect, useCallback, useRef } from 'react'
import settingsStore from '@/features/stores/settings'
import homeStore from '@/features/stores/home'
import { speakCharacter } from '@/features/messages/speakCharacter'
import { SpeakQueue } from '@/features/messages/speakQueue'
import { Talk } from '@/features/messages/messages'
import CaptureService from '@/features/gameCommentary/captureService'
import { generateGameCommentary } from '@/features/gameCommentary/generateGameCommentary'

/**
 * ゲーム実況モードの状態型
 */
export type GameCommentaryState =
  | 'disabled'
  | 'waiting'
  | 'capturing'
  | 'speaking'

/**
 * useGameCommentaryModeフックのコールバック
 */
export interface UseGameCommentaryModeProps {
  onCommentaryStart?: (phrase: { text: string; emotion: string }) => void
  onCommentaryComplete?: () => void
  onCommentaryInterrupted?: () => void
}

/**
 * useGameCommentaryModeフックの戻り値
 */
export interface UseGameCommentaryModeReturn {
  isActive: boolean
  state: GameCommentaryState
  secondsUntilNextCapture: number
  isCaptureAvailable: boolean
  resetTimer: () => void
  stopCommentary: () => void
}

/**
 * ゲーム実況モードのコアロジックを提供するカスタムフック
 *
 * 画面キャプチャを一定間隔で取得し、AIがリアルタイムで実況コメントを生成・発話する。
 * 完了ベースのsetTimeoutループにより、生成時間+発話時間が長くても重ならない。
 */
export function useGameCommentaryMode({
  onCommentaryStart,
  onCommentaryComplete,
  onCommentaryInterrupted,
}: UseGameCommentaryModeProps): UseGameCommentaryModeReturn {
  // ----- 設定の取得 -----
  const ss = settingsStore.getState()
  const gameCommentaryEnabled =
    (ss as Record<string, unknown>).gameCommentaryEnabled === true
  const gameCommentaryCaptureInterval =
    ((ss as Record<string, unknown>).gameCommentaryCaptureInterval as number) ||
    15
  const gameCommentaryContextCount =
    ((ss as Record<string, unknown>).gameCommentaryContextCount as number) || 5
  const gameCommentarySaveToChat =
    (ss as Record<string, unknown>).gameCommentarySaveToChat === true
  const gameCommentaryImageQuality =
    ((ss as Record<string, unknown>).gameCommentaryImageQuality as number) ||
    0.7
  const gameCommentaryResizeWidth =
    ((ss as Record<string, unknown>).gameCommentaryResizeWidth as number) ||
    1024

  // settingsStoreの変更を監視して再レンダリングをトリガー
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    const unsubscribe = settingsStore.subscribe(() => {
      forceUpdate((n) => n + 1)
    })
    return unsubscribe
  }, [])

  // ----- 状態 -----
  const [state, setState] = useState<GameCommentaryState>(
    gameCommentaryEnabled ? 'waiting' : 'disabled'
  )
  const [secondsUntilNextCapture, setSecondsUntilNextCapture] =
    useState<number>(gameCommentaryCaptureInterval)
  const [isCaptureAvailable, setIsCaptureAvailable] = useState<boolean>(false)

  // ----- Refs -----
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const commentaryHistoryRef = useRef<string[]>([])
  const isProcessingRef = useRef(false)

  // Callback refs to avoid stale closures
  const callbackRefs = useRef({
    onCommentaryStart,
    onCommentaryComplete,
    onCommentaryInterrupted,
  })

  useEffect(() => {
    callbackRefs.current = {
      onCommentaryStart,
      onCommentaryComplete,
      onCommentaryInterrupted,
    }
  })

  // ----- CaptureService可用性チェック -----
  useEffect(() => {
    const checkInterval = setInterval(() => {
      setIsCaptureAvailable(CaptureService.getInstance().isAvailable())
    }, 1000)
    return () => clearInterval(checkInterval)
  }, [])

  // ----- 発話条件判定 -----
  const canSpeak = useCallback((): boolean => {
    const hs = homeStore.getState()
    if (hs.chatProcessingCount > 0) return false
    if (hs.isSpeaking) return false
    if (!hs.captureStatus) return false
    return true
  }, [])

  // ----- ring bufferに追加 -----
  const addToHistory = useCallback(
    (text: string) => {
      commentaryHistoryRef.current.push(text)
      if (commentaryHistoryRef.current.length > gameCommentaryContextCount) {
        commentaryHistoryRef.current = commentaryHistoryRef.current.slice(
          -gameCommentaryContextCount
        )
      }
    },
    [gameCommentaryContextCount]
  )

  // ----- タイマークリア -----
  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }, [])

  // ----- 次回キャプチャのスケジュール -----
  const scheduleNext = useCallback(() => {
    clearTimers()
    setSecondsUntilNextCapture(gameCommentaryCaptureInterval)

    countdownRef.current = setInterval(() => {
      setSecondsUntilNextCapture((prev) => Math.max(prev - 1, 0))
    }, 1000)

    timerRef.current = setTimeout(() => {
      triggerCommentary()
    }, gameCommentaryCaptureInterval * 1000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameCommentaryCaptureInterval, clearTimers])

  // ----- 実況トリガー -----
  const triggerCommentary = useCallback(async () => {
    if (isProcessingRef.current) return
    if (!canSpeak()) {
      scheduleNext()
      return
    }

    const captureService = CaptureService.getInstance()
    if (!captureService.isAvailable()) {
      scheduleNext()
      return
    }

    isProcessingRef.current = true
    setState('capturing')

    // キャプチャ取得
    const imageData = captureService.captureFrame(
      gameCommentaryResizeWidth,
      gameCommentaryImageQuality
    )

    if (!imageData) {
      console.warn('ゲーム実況: キャプチャ取得失敗')
      isProcessingRef.current = false
      setState('waiting')
      scheduleNext()
      return
    }

    // AI実況コメント生成
    try {
      const result = await generateGameCommentary(
        commentaryHistoryRef.current,
        imageData
      )

      if (!result) {
        isProcessingRef.current = false
        setState('waiting')
        scheduleNext()
        return
      }

      // ring bufferに追加
      addToHistory(result.text)

      // chatLogにも保存（opt-in）
      if (gameCommentarySaveToChat) {
        homeStore.getState().upsertMessage({
          role: 'assistant',
          content: result.text,
        })
      }

      // 状態をspeakingに変更
      setState('speaking')
      callbackRefs.current.onCommentaryStart?.(result)

      // Talk オブジェクト作成
      const talk: Talk = {
        message: result.text,
        emotion: result.emotion,
      }

      // セッションIDを更新
      sessionIdRef.current = `game-commentary-${Date.now()}`

      // 発話実行（完了ベース: 発話完了後に次回スケジュール）
      speakCharacter(
        sessionIdRef.current,
        talk,
        () => {
          // onStart
        },
        () => {
          // onComplete
          isProcessingRef.current = false
          setState('waiting')
          callbackRefs.current.onCommentaryComplete?.()
          scheduleNext()
        }
      )
    } catch (error) {
      console.error('ゲーム実況コメント生成エラー:', error)
      isProcessingRef.current = false
      setState('waiting')
      scheduleNext()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canSpeak,
    gameCommentaryResizeWidth,
    gameCommentaryImageQuality,
    gameCommentarySaveToChat,
    addToHistory,
  ])

  // ----- タイマーリセット -----
  const resetTimer = useCallback(() => {
    clearTimers()
    setSecondsUntilNextCapture(gameCommentaryCaptureInterval)
    if (gameCommentaryEnabled && state !== 'disabled') {
      scheduleNext()
    }
  }, [
    gameCommentaryCaptureInterval,
    gameCommentaryEnabled,
    state,
    clearTimers,
    scheduleNext,
  ])

  // ----- 実況停止 -----
  const stopCommentary = useCallback(() => {
    clearTimers()
    isProcessingRef.current = false
    SpeakQueue.stopAll()
    setState('waiting')
    setSecondsUntilNextCapture(gameCommentaryCaptureInterval)
    callbackRefs.current.onCommentaryInterrupted?.()
  }, [gameCommentaryCaptureInterval, clearTimers])

  // ----- 有効/無効の監視 -----
  useEffect(() => {
    if (gameCommentaryEnabled) {
      setState('waiting')
      setSecondsUntilNextCapture(gameCommentaryCaptureInterval)
      scheduleNext()
    } else {
      setState('disabled')
      clearTimers()
      commentaryHistoryRef.current = []
      isProcessingRef.current = false
    }

    return () => {
      clearTimers()
    }
  }, [
    gameCommentaryEnabled,
    gameCommentaryCaptureInterval,
    clearTimers,
    scheduleNext,
  ])

  // ----- chatLog変更の監視（ユーザー入力検知） -----
  useEffect(() => {
    if (!gameCommentaryEnabled) return

    const unsubscribe = homeStore.subscribe((hState, prevState) => {
      if (hState.chatLog !== prevState.chatLog && hState.chatLog.length > 0) {
        // ユーザー入力があったらタイマーリセット
        const latestMsg = hState.chatLog[hState.chatLog.length - 1]
        if (latestMsg?.role === 'user') {
          resetTimer()

          // 発話中の場合は停止
          if (state === 'speaking') {
            stopCommentary()
          }
        }
      }
    })

    return unsubscribe
  }, [gameCommentaryEnabled, state, resetTimer, stopCommentary])

  return {
    isActive: gameCommentaryEnabled && state !== 'disabled',
    state,
    secondsUntilNextCapture,
    isCaptureAvailable,
    resetTimer,
    stopCommentary,
  }
}
