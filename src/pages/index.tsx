import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Form } from '@/components/form'
import MessageReceiver from '@/components/messageReceiver'
import { Introduction } from '@/components/introduction'
import { Menu } from '@/components/menu'
import { Meta } from '@/components/meta'
import ModalImage from '@/components/modalImage'
import VrmViewer from '@/components/vrmViewer'
import Live2DViewer from '@/components/live2DViewer'
import PNGTuberViewer from '@/components/pngTuberViewer'
import { Toasts } from '@/components/toasts'
import { WebSocketManager } from '@/components/websocketManager'
import CharacterPresetMenu from '@/components/characterPresetMenu'
import ImageOverlay from '@/components/ImageOverlay'
import SplatControls from '@/components/splatControls'
import PresenceManager from '@/components/presenceManager'
import IdleManager from '@/components/idleManager'
import GameCommentaryManager from '@/components/gameCommentaryManager'
import { KioskOverlay } from '@/features/kiosk/kioskOverlay'
import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import '@/lib/i18n'
import { buildUrl } from '@/utils/buildUrl'
import { YoutubeManager } from '@/components/youtubeManager'
import { MemoryServiceInitializer } from '@/components/memoryServiceInitializer'
import toastStore from '@/features/stores/toast'
import { usePresetLoader } from '@/features/presets/usePresetLoader'
import { useLive2DEnabled } from '@/hooks/useLive2DEnabled'

const Home = () => {
  const webcamStatus = homeStore((s) => s.webcamStatus)
  const captureStatus = homeStore((s) => s.captureStatus)
  const backgroundImageUrl = homeStore((s) => s.backgroundImageUrl)
  const useVideoAsBackground = settingsStore((s) => s.useVideoAsBackground)
  const gaussianSplatEnabled = settingsStore((s) => s.gaussianSplatEnabled)
  const gaussianSplatLoading = homeStore((s) => s.gaussianSplatLoading)
  const bgUrl =
    (webcamStatus || captureStatus) && useVideoAsBackground
      ? ''
      : backgroundImageUrl === 'green'
        ? ''
        : `url(${buildUrl(backgroundImageUrl)})`
  const messageReceiverEnabled = settingsStore((s) => s.messageReceiverEnabled)
  const modelType = settingsStore((s) => s.modelType)
  const { isLive2DEnabled } = useLive2DEnabled()
  const characterPreset1 = settingsStore((s) => s.characterPreset1)
  const characterPreset2 = settingsStore((s) => s.characterPreset2)
  const characterPreset3 = settingsStore((s) => s.characterPreset3)
  const characterPreset4 = settingsStore((s) => s.characterPreset4)
  const characterPreset5 = settingsStore((s) => s.characterPreset5)
  const { t } = useTranslation()
  usePresetLoader()
  const characterPresets = useMemo(
    () => [
      { key: 'characterPreset1', value: characterPreset1 },
      { key: 'characterPreset2', value: characterPreset2 },
      { key: 'characterPreset3', value: characterPreset3 },
      { key: 'characterPreset4', value: characterPreset4 },
      { key: 'characterPreset5', value: characterPreset5 },
    ],
    [
      characterPreset1,
      characterPreset2,
      characterPreset3,
      characterPreset4,
      characterPreset5,
    ]
  )

  // Background switch timer
  const backgroundImageList = homeStore((s) => s.backgroundImageList)
  const currentBackgroundIndex = homeStore((s) => s.currentBackgroundIndex)
  const backgroundSwitchMode = homeStore((s) => s.backgroundSwitchMode)
  const backgroundSwitchInterval = homeStore((s) => s.backgroundSwitchInterval)

  useEffect(() => {
    if (backgroundSwitchMode !== 'timer' || backgroundImageList.length <= 1) {
      return
    }

    const interval = backgroundSwitchInterval * 1000
    const timer = setInterval(() => {
      const state = homeStore.getState()
      const nextIndex =
        (state.currentBackgroundIndex + 1) % state.backgroundImageList.length
      const nextUrl = state.backgroundImageList[nextIndex]
      homeStore.setState({
        currentBackgroundIndex: nextIndex,
        backgroundImageUrl: nextUrl,
      })
    }, interval)

    return () => clearInterval(timer)
  }, [
    backgroundSwitchMode,
    backgroundSwitchInterval,
    backgroundImageList.length,
  ])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey) {
        // shiftキーを押しながら数字キーを押すためのマッピング
        const keyMap: { [key: string]: number } = {
          Digit1: 1,
          Digit2: 2,
          Digit3: 3,
          Digit4: 4,
          Digit5: 5,
        }

        const keyNumber = keyMap[event.code]

        if (keyNumber) {
          settingsStore.setState({
            systemPrompt: characterPresets[keyNumber - 1].value,
          })
          toastStore.getState().addToast({
            message: t('Toasts.PresetSwitching', {
              presetName: t(`Characterpreset${keyNumber}`),
            }),
            type: 'info',
            tag: `character-preset-switching`,
          })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [characterPresets, t])

  // Keyboard controls for 3DGS splat movement (independent of VRM camera)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't capture when typing in input fields
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return
      }

      const gsEnabled = settingsStore.getState().gaussianSplatEnabled
      if (!gsEnabled) return

      const viewer = homeStore.getState().viewer
      if (!viewer) return

      // Rotation increment in radians (~2.9 degrees per press)
      const ROT = 0.05

      // Arrow keys for movement — Shift=10×, Shift+Option=100×
      let mult = 1
      if (event.shiftKey) mult = 10
      if (event.shiftKey && event.altKey) mult = 100

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault()
          viewer.moveSplat(0, 1 * mult, 0)
          break
        case 'ArrowDown':
          event.preventDefault()
          viewer.moveSplat(0, -1 * mult, 0)
          break
        case 'ArrowLeft':
          event.preventDefault()
          viewer.moveSplat(-1 * mult, 0, 0)
          break
        case 'ArrowRight':
          event.preventDefault()
          viewer.moveSplat(1 * mult, 0, 0)
          break
        case '+':
        case '=':
          viewer.zoomSplat(1.1)
          break
        case '-':
          viewer.zoomSplat(0.9)
          break
        // Rotation
        case 'q':
        case 'Q':
          viewer.rotateSplat(-ROT, 0, 0) // Roll counter-clockwise
          break
        case 'e':
        case 'E':
          viewer.rotateSplat(ROT, 0, 0) // Roll clockwise
          break
        case 'w':
        case 'W':
          viewer.rotateSplat(0, ROT, 0) // Pitch up
          break
        case 's':
        case 'S':
          viewer.rotateSplat(0, -ROT, 0) // Pitch down
          break
        case 'a':
        case 'A':
          viewer.rotateSplat(0, 0, -ROT) // Yaw left
          break
        case 'd':
        case 'D':
          viewer.rotateSplat(0, 0, ROT) // Yaw right
          break
        case 'r':
        case 'R':
          viewer.fitSplatToViewport()
          break
        case 'g':
        case 'G':
          viewer.resetSplatToInitialPosition()
          break
        case 'h':
        case 'H':
          event.preventDefault()
          const current = homeStore.getState().gaussianSplatControlsVisible
          homeStore.setState({ gaussianSplatControlsVisible: !current })
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const backgroundStyle =
    (webcamStatus || captureStatus) && useVideoAsBackground
      ? {}
      : gaussianSplatEnabled || gaussianSplatLoading
        ? {}
        : backgroundImageUrl === 'green'
          ? { backgroundColor: '#00FF00' }
          : { backgroundImage: bgUrl }

  return (
    <div className="h-[100svh] bg-cover" style={backgroundStyle}>
      <Meta />
      <Introduction />
      {modelType === 'live2d' && isLive2DEnabled ? (
        <Live2DViewer />
      ) : modelType === 'pngtuber' ? (
        <PNGTuberViewer />
      ) : (
        <VrmViewer />
      )}
      <Form />
      <Menu />
      <ModalImage />
      {messageReceiverEnabled && <MessageReceiver />}
      <Toasts />
      <WebSocketManager />
      <YoutubeManager />
      <MemoryServiceInitializer />
      <CharacterPresetMenu />
      <ImageOverlay />
      <SplatControls />
      {/* Show-controls button when pane is hidden */}
      <ShowSplatControlsButton />
      <PresenceManager />
      <div className="absolute top-4 left-4 z-30">
        <IdleManager />
        <GameCommentaryManager />
      </div>
      <KioskOverlay />
    </div>
  )
}

/** Small floating button to show the 3DGS controls pane when it is hidden. */
function ShowSplatControlsButton() {
  const gsEnabled = settingsStore((s) => s.gaussianSplatEnabled)
  const controlsVisible = homeStore((s) => s.gaussianSplatControlsVisible)

  if (!gsEnabled || controlsVisible) return null

  return (
    <div className="absolute bottom-6 right-6 z-30">
      <button
        className="w-10 h-10 rounded-full bg-gray-900/70 backdrop-blur-sm border border-white/10
                   flex items-center justify-center text-white text-sm font-bold
                   hover:bg-gray-700/80 active:bg-gray-600/80 transition-colors duration-150"
        onClick={() =>
          homeStore.setState({ gaussianSplatControlsVisible: true })
        }
        title="Show 3DGS controls (H key)"
        aria-label="Show 3DGS controls"
      >
        🎮
      </button>
    </div>
  )
}

export default Home
