import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'

import { AssistantText } from '@/components/assistantText'
import { Form } from '@/components/form'
import ImageOverlay from '@/components/ImageOverlay'
import Live2DViewer from '@/components/live2DViewer'
import { MemoryServiceInitializer } from '@/components/memoryServiceInitializer'
import ModalImage from '@/components/modalImage'
import PNGTuberViewer from '@/components/pngTuberViewer'
import { Toasts } from '@/components/toasts'
import VrmViewer from '@/components/vrmViewer'
import {
  getEmbedConfig,
  getEmbedOverridesFromSearchParams,
  isEmbedOriginAllowed,
  mergeEmbedConfig,
  toPresetQuestions,
} from '@/features/embed/embedConfig'
import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import { useLive2DEnabled } from '@/hooks/useLive2DEnabled'
import '@/lib/i18n'
import { usePresetLoader } from '@/features/presets/usePresetLoader'
import { getLatestAssistantMessage } from '@/utils/assistantMessageUtils'
import { buildUrl } from '@/utils/buildUrl'

type Props = {
  embedId?: string
}

const applyEmbedConfig = (embedId?: string) => {
  const params = new URLSearchParams(window.location.search)
  const baseConfig = getEmbedConfig(embedId || params.get('embedId') || '')
  const queryConfig = getEmbedOverridesFromSearchParams(params)
  const config = mergeEmbedConfig(baseConfig, queryConfig)

  if (!isEmbedOriginAllowed(config, document.referrer)) {
    return { allowed: false, id: config.id || embedId || '' }
  }

  settingsStore.setState({
    showControlPanel: false,
    showQuickMenu: false,
    messageReceiverEnabled: false,
    slideMode: false,
    ...(config.characterName && { characterName: config.characterName }),
    ...(config.userDisplayName && { userDisplayName: config.userDisplayName }),
    ...(config.systemPrompt && { systemPrompt: config.systemPrompt }),
    ...(config.modelType && { modelType: config.modelType }),
    ...(config.selectedVrmPath && { selectedVrmPath: config.selectedVrmPath }),
    ...(config.selectedLive2DPath && {
      selectedLive2DPath: config.selectedLive2DPath,
    }),
    ...(config.selectedPNGTuberPath && {
      selectedPNGTuberPath: config.selectedPNGTuberPath,
    }),
    ...(config.showAssistantText !== undefined && {
      showAssistantText: config.showAssistantText,
    }),
    ...(config.showCharacterName !== undefined && {
      showCharacterName: config.showCharacterName,
    }),
    ...(config.showPresetQuestions !== undefined && {
      showPresetQuestions: config.showPresetQuestions,
    }),
    ...(config.presetQuestions && {
      presetQuestions: toPresetQuestions(config.presetQuestions),
    }),
    ...(config.colorTheme && { colorTheme: config.colorTheme }),
  })

  if (config.colorTheme) {
    document.documentElement.setAttribute('data-theme', config.colorTheme)
  }

  if (config.backgroundImageUrl) {
    homeStore.setState({ backgroundImageUrl: config.backgroundImageUrl })
  }

  return { allowed: true, id: config.id || embedId || '' }
}

export const EmbedApp = ({ embedId }: Props) => {
  const webcamStatus = homeStore((s) => s.webcamStatus)
  const captureStatus = homeStore((s) => s.captureStatus)
  const backgroundImageUrl = homeStore((s) => s.backgroundImageUrl)
  const chatLog = homeStore((s) => s.chatLog)
  const useVideoAsBackground = settingsStore((s) => s.useVideoAsBackground)
  const modelType = settingsStore((s) => s.modelType)
  const showAssistantText = settingsStore((s) => s.showAssistantText)
  const { isLive2DEnabled } = useLive2DEnabled()
  const latestAssistantMessage = getLatestAssistantMessage(chatLog)
  const [isReady, setIsReady] = useState(false)
  const [isAllowed, setIsAllowed] = useState(true)
  const [resolvedEmbedId, setResolvedEmbedId] = useState(embedId || '')
  usePresetLoader()

  useEffect(() => {
    const result = applyEmbedConfig(embedId)

    const timeoutId = window.setTimeout(() => {
      setResolvedEmbedId(result.id)
      setIsAllowed(result.allowed)
      setIsReady(true)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [embedId])

  const backgroundStyle = useMemo(
    () =>
      (webcamStatus || captureStatus) && useVideoAsBackground
        ? {}
        : backgroundImageUrl === 'green'
          ? { backgroundColor: '#00FF00' }
          : { backgroundImage: `url(${buildUrl(backgroundImageUrl)})` },
    [webcamStatus, captureStatus, useVideoAsBackground, backgroundImageUrl]
  )

  if (!isReady) {
    return (
      <>
        <Head>
          <title>AITuberKit Embed</title>
        </Head>
        <main className="h-[100svh] bg-theme-default" />
      </>
    )
  }

  if (!isAllowed) {
    return (
      <>
        <Head>
          <title>AITuberKit Embed</title>
        </Head>
        <main className="flex h-[100svh] items-center justify-center bg-theme-default px-4 text-center text-sm font-bold text-theme-default">
          This AITuberKit embed is not available on this site.
        </main>
      </>
    )
  }

  return (
    <>
      <Head>
        <title>
          {resolvedEmbedId
            ? `${resolvedEmbedId} - AITuberKit Embed`
            : 'AITuberKit Embed'}
        </title>
      </Head>
      <main
        className="relative h-[100svh] overflow-hidden bg-cover bg-center text-theme-default"
        style={backgroundStyle}
        data-aituber-kit-embed-id={resolvedEmbedId}
      >
        {modelType === 'live2d' && isLive2DEnabled ? (
          <Live2DViewer />
        ) : modelType === 'pngtuber' ? (
          <PNGTuberViewer />
        ) : (
          <VrmViewer />
        )}
        {showAssistantText && latestAssistantMessage && (
          <AssistantText message={latestAssistantMessage} />
        )}
        <Form />
        <ModalImage />
        <Toasts />
        <MemoryServiceInitializer />
        <ImageOverlay />
      </main>
    </>
  )
}
