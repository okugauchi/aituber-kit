import { logger } from '@/lib/logger'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import { loadVRMAnimation } from '@/lib/VRMAnimation/loadVRMAnimation'
import PoseTestButton from '@/components/poseTestButton'
import ModelLoadingOverlay from '@/components/modelLoadingOverlay'
import ErrorBoundary from '@/components/common/ErrorBoundary'

function VrmViewerInner() {
  const [isModelLoading, setIsModelLoading] = useState(false)
  const ui3dModeRef = useRef<string>('css-overlay')

  // Subscribe to ui3dMode changes and sync 3D UI meshes
  useEffect(() => {
    const unsub = settingsStore.subscribe((state, prev) => {
      if (state.ui3dMode !== prev.ui3dMode) {
        ui3dModeRef.current = state.ui3dMode
        sync3dUi()
      }
    })
    // Also sync on initial load
    sync3dUi()
    return unsub
  }, [])

  /** Collect DOM elements for 3D UI rendering and sync with viewer. */
  function sync3dUi() {
    const { viewer } = homeStore.getState()
    const mode = settingsStore.getState().ui3dMode
    if (!viewer.isReady) return

    if (mode === 'css-overlay') {
      viewer.clearAllUi3dMeshes()
      return
    }

    // Find UI elements by known CSS class selectors
    const elements: Record<string, {
      dom: HTMLElement
      position: THREE.Vector3
      scale?: number
    }> = {}

    // Chat log panel
    const chatLog = document.querySelector('[data-ui3d-id="chatLog"]') as HTMLElement | null
    if (chatLog) {
      elements.chatLog = {
        dom: chatLog,
        position: new THREE.Vector3(1.5, 1.0, -2.5),
        scale: 0.002,
      }
    }

    // Assistant speech bubble
    const assistantText = document.querySelector('[data-ui3d-id="assistantText"]') as HTMLElement | null
    if (assistantText) {
      elements.assistantText = {
        dom: assistantText,
        position: new THREE.Vector3(0, 1.8, -2.5),
        scale: 0.0015,
      }
    }

    // Message input area
    const messageInput = document.querySelector('[data-ui3d-id="messageInput"]') as HTMLElement | null
    if (messageInput) {
      elements.messageInput = {
        dom: messageInput,
        position: new THREE.Vector3(0, -0.5, -2.5),
        scale: 0.002,
      }
    }

    viewer.syncUi3dMode(mode, elements)
  }

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
      // Clean up 3D UI meshes on unmount
      viewer.clearAllUi3dMeshes()
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

      // Sync 3D UI meshes after setup
      sync3dUi()

      // Drag and DropでVRMを差し替え
      canvas.addEventListener('dragover', function (event) {
        event.preventDefault()
      })

      canvas.addEventListener('drop', function (event) {
        event.preventDefault()

        const files = event.dataTransfer?.files
