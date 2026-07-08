'use client'

import { logger } from '@/lib/logger'
import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Script from 'next/script'
import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import ModelLoadingOverlay from '@/components/modelLoadingOverlay'
import ErrorBoundary from '@/components/common/ErrorBoundary'

const Live2DComponent = dynamic(
  () => {
    logger.log('Loading Live2DComponent...')
    return import('./Live2DComponent')
      .then((mod) => mod.default)
      .then((mod) => {
        logger.log('Live2DComponent loaded successfully')
        return mod
      })
      .catch((err) => {
        logger.error('Failed to load Live2DComponent:', err)
        throw err
      })
  },
  {
    ssr: false,
    loading: () => {
      logger.log('Live2DComponent is loading...')
      return <ModelLoadingOverlay />
    },
  }
)

function Live2DViewerInner() {
  const [isMounted, setIsMounted] = useState(false)
  const [scriptLoadRetries, setScriptLoadRetries] = useState({
    cubismcore: 0,
    live2d: 0,
  })
  const MAX_RETRIES = 3

  const isCubismCoreLoaded = homeStore((s) => s.isCubismCoreLoaded)
  const setIsCubismCoreLoaded = homeStore((s) => s.setIsCubismCoreLoaded)
  const isLive2dLoaded = homeStore((s) => s.isLive2dLoaded)
  const setIsLive2dLoaded = homeStore((s) => s.setIsLive2dLoaded)

  // スクリプトの再読み込み処理
  const retryLoadScript = (scriptName: 'cubismcore' | 'live2d') => {
    if (scriptLoadRetries[scriptName] < MAX_RETRIES) {
      setScriptLoadRetries((prev) => ({
        ...prev,
        [scriptName]: prev[scriptName] + 1,
      }))
      // 強制的に再読み込みするためにキーを変更
      return true
    }
    return false
  }

  useEffect(() => {
    logger.log('Live2DViewer mounted')
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    logger.log('Live2DViewer not mounted yet')
    return <ModelLoadingOverlay />
  }

  logger.log('Rendering Live2DViewer')
  return (
    <div className="fixed bottom-0 right-0 w-screen h-screen z-5">
      <Script
        key={`cubismcore-${scriptLoadRetries.cubismcore}`}
        src="/scripts/live2dcubismcore.min.js"
        strategy="afterInteractive"
        onLoad={() => {
          logger.log('cubismcore loaded')
          setIsCubismCoreLoaded(true)
        }}
        onError={() => {
          logger.error('Failed to load cubism core')
          if (retryLoadScript('cubismcore')) {
            logger.log('Retrying cubismcore load...')
          } else {
            logger.error('Max retries reached for cubismcore')
          }
        }}
      />
      {!isCubismCoreLoaded && <ModelLoadingOverlay />}
      {isCubismCoreLoaded && <Live2DComponent />}
    </div>
  )
}

export default function Live2DViewer() {
  const selectedLive2DPath = settingsStore((s) => s.selectedLive2DPath)
  return (
    <ErrorBoundary name="live2d-viewer" resetKey={selectedLive2DPath}>
      <Live2DViewerInner />
    </ErrorBoundary>
  )
}
