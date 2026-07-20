import { logger } from '@/lib/logger'
import { useCallback, useEffect, useState } from 'react'
import * as THREE from 'three'

import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import { loadVRMAnimation } from '@/lib/VRMAnimation/loadVRMAnimation'
import PoseTestButton from '@/components/poseTestButton'
import ModelLoadingOverlay from '@/components/modelLoadingOverlay'
import ErrorBoundary from '@/components/common/ErrorBoundary'

function VrmViewerInner() {
  const [isModelLoading, setIsModelLoading] = useState(false)

  // CSS Anchor Positioning bridge: update a hidden anchor element every frame
  // so the assistant speech bubble can use `anchor()` positioning.
  useEffect(() => {
    const { viewer } = homeStore.getState()
    if (!viewer) return

    // Create a hidden anchor element that tracks the VRM character's screen position
    const anchor = document.createElement('div')
    anchor.id = 'character-anchor'
    anchor.style.cssText =
      'position:fixed; left:0; top:0; width:1px; height:1px; pointer-events:none; z-index:-1; anchor-name:--character'
    document.body.appendChild(anchor)

    viewer.onCharacterScreenPosition = (x, y) => {
      // Map normalized -1..1 coordinates to CSS viewport percent
      const vw = ((x + 1) / 2) * 100
      const vh = y * 100 // y is already flipped (1 - normalizedY)
      anchor.style.left = vw + 'vw'
      anchor.style.top = vh + 'vw'
      // Also set CSS custom properties for anchor() fallback
      document.documentElement.style.setProperty(
        '--character-x-pct',
        vw.toString()
      )
      document.documentElement.style.setProperty(
        '--character-y-pct',
        vh.toString()
      )
    }

    return () => {
      viewer.onCharacterScreenPosition = null
      document.body.removeChild(anchor)
      document.documentElement.style.removeProperty('--character-x-pct')
      document.documentElement.style.removeProperty('--character-y-pct')
    }
  }, [])

  useEffect(() => {
    const { viewer } = homeStore.getState()
    viewer.onModelLoadingChange = setIsModelLoading

    return () => {
      if (viewer.onModelLoadingChange === setIsModelLoading) {
        viewer.onModelLoadingChange = undefined
      }
    }
  }, [])

  const canvasRef = useCallback((canvas: HTMLCanvasElement) => {
    if (canvas) {
      const { viewer } = homeStore.getState()
      const { selectedVrmPath } = settingsStore.getState()
      const { gaussianSplatEnabled, gaussianSplatUrl } = homeStore.getState()
      viewer.onModelLoadingChange = setIsModelLoading
      viewer.setup(canvas)
      viewer.loadVrm(selectedVrmPath)

      // Auto-load 3DGS splat scene on startup if enabled and URL is set
      if (gaussianSplatEnabled && gaussianSplatUrl) {
        viewer.loadSplatScene(gaussianSplatUrl)
      }

      // Drag and DropでVRMを差し替え
      canvas.addEventListener('dragover', function (event) {
        event.preventDefault()
      })

      canvas.addEventListener('drop', function (event) {
        event.preventDefault()

        const files = event.dataTransfer?.files
        if (!files) {
          return
        }

        const file = files[0]
        if (!file) {
          return
        }
        const file_type = file.name.split('.').pop()
        if (file_type === 'vrm') {
          const blob = new Blob([file], { type: 'application/octet-stream' })
          const url = window.URL.createObjectURL(blob)
          viewer.loadVrm(url)
        } else if (file_type === 'vrma') {
          const blob = new Blob([file], { type: 'application/octet-stream' })
          const url = window.URL.createObjectURL(blob)
          loadVRMAnimation(url)
            .then((vrma) => {
              if (vrma) viewer.model?.loadAnimation(vrma)
            })
            .catch((error) => {
              logger.error('Failed to load VRMA:', error)
            })
            .finally(() => URL.revokeObjectURL(url))
        } else if (file.type.startsWith('image/')) {
          const reader = new FileReader()
          reader.readAsDataURL(file)
          reader.onload = function () {
            const image = reader.result as string
            image !== '' && homeStore.setState({ modalImage: image })
          }
        }
      })
    }
  }, [])

  const poseAdjustMode = settingsStore((s) => s.poseAdjustMode)

  return (
    <>
      <div className={'absolute top-0 left-0 w-screen h-[100svh] z-5'}>
        <canvas ref={canvasRef} className={'h-full w-full'}></canvas>
        {isModelLoading && <ModelLoadingOverlay />}
      </div>
      {poseAdjustMode && <PoseTestButton />}
    </>
  )
}

export default function VrmViewer() {
  const selectedVrmPath = settingsStore((s) => s.selectedVrmPath)
  return (
    <ErrorBoundary name="vrm-viewer" resetKey={selectedVrmPath}>
      <VrmViewerInner />
    </ErrorBoundary>
  )
}
