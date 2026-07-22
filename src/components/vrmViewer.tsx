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

  // Separate effect: apply DOM visibility on ui3dMode change independently
  // of viewer readiness. This ensures elements get hidden/shown even when
  // sync3dUi() can't run because viewer isn't ready yet.
  useEffect(() => {
    const unsub = settingsStore.subscribe((state, prev) => {
      if (state.ui3dMode !== prev.ui3dMode) {
        applyDomVisibility(state.ui3dMode)
      }
    })
    // Apply initial state (elements may not be mounted yet — retry periodically)
    const checkAndApply = () => {
      const els = document.querySelectorAll('[data-ui3d-id]')
      if (els.length > 0) {
        applyDomVisibility(settingsStore.getState().ui3dMode)
      } else {
        // Elements not yet mounted — retry on next rAF
        requestAnimationFrame(checkAndApply)
      }
    }
    checkAndApply()
    return unsub
  }, [])

  /** Collect DOM elements for 3D UI rendering and sync with viewer. */
  /** Hide or show DOM overlay elements based on ui3dMode.
   *  In 'html-in-canvas' mode, only the chatLog is hidden — the messageInput
   *  must stay visible so the user can type, and the assistantText stays visible
   *  as a DOM overlay (not rendered as a 3D mesh) to avoid perspective width
   *  distortion. In 'css-overlay' all elements remain visible. */
  function applyDomVisibility(mode: string) {
    const selector = '[data-ui3d-id]'
    const elements = document.querySelectorAll<HTMLElement>(selector)
    const hidden = mode === 'html-in-canvas'
    for (const el of elements) {
      const id = el.getAttribute('data-ui3d-id')
      // Only hide chatLog in html-in-canvas mode. messageInput and assistantText
      // stay as visible DOM overlays in all modes.
      const skipHide = id === 'messageInput' || id === 'assistantText'
      if (hidden && !skipHide) {
        el.style.setProperty('visibility', 'hidden', 'important')
      } else {
        el.style.removeProperty('visibility')
        // Remove fallback background added by ensureVisibleBackground
        // from both the outer element and any inner .aurora-glass-bubble
        el.style.removeProperty('background-color')
        el.style.removeProperty('border')
        el.style.removeProperty('border-radius')
        el.style.removeProperty('padding')
        const bubble = el.querySelector<HTMLElement>('.aurora-glass-bubble')
        if (bubble) {
          bubble.style.removeProperty('background-color')
          bubble.style.removeProperty('border')
          bubble.style.removeProperty('border-radius')
          bubble.style.removeProperty('padding')
        }
      }
    }
  }

  function sync3dUi() {
    const { viewer } = homeStore.getState()
    const mode = settingsStore.getState().ui3dMode
    const assistantTextStyle = settingsStore.getState().assistantTextStyle
    if (!viewer.isReady) return

    if (mode === 'css-overlay') {
      viewer.clearAllUi3dMeshes()
      applyDomVisibility(mode)
      return
    }

    // Find UI elements by known CSS class selectors
    const elements: Record<string, {
      dom: HTMLElement
      position: THREE.Vector3
      scale?: number
    }> = {}

    // Camera-space positions (HUD overlay) — meshes are repositioned every
    // frame to track the camera. Negative z = in front of camera,
    // y = up from camera center, x = right from camera center.
    // With 20° FOV, visible height at z=-1.3 is ~0.46 units, so y offsets
    // must stay within [-0.23, +0.23] to be inside the view frustum.
    // Scale 0.5 keeps meshes small enough to fit entirely in the viewport.

    // Temporarily add a visible background to the bubble/panel elements
    // before creating HTMLMesh textures. three.js html2canvas doesn't
    // support glass/blur effects, so we use a solid fallback.
    // Targets inner .aurora-glass-bubble / .aurora-glass-capsule children
    // rather than the outer full-width wrapper.
    function ensureVisibleBackground(el: HTMLElement) {
      // Find the first glass child (bubble or capsule)
      const glass = el.querySelector<HTMLElement>('.aurora-glass-bubble, .aurora-glass-capsule')
      const target = glass || el
      target.style.setProperty('background', 'rgba(17, 19, 28, 0.85)', 'important')
      target.style.setProperty('border', '1px solid rgba(255, 255, 255, 0.2)', 'important')
      target.style.setProperty('border-radius', '31px', 'important')
      target.style.setProperty('padding', '12px', 'important')
      // Match input form width for the assistant text
      if (el.getAttribute('data-ui3d-id') === 'assistantText') {
        target.style.setProperty('max-width', '680px', 'important')
        target.style.setProperty('width', '100%', 'important')
      }
    }

    // Chat log panel — right side
    const chatLog = document.querySelector('[data-ui3d-id="chatLog"]') as HTMLElement | null
    if (chatLog) {
      ensureVisibleBackground(chatLog)
      elements.chatLog = {
        dom: chatLog,
        position: new THREE.Vector3(0.5, 0, -1.3),
        scale: 0.5,
      }
    }

    // Assistant speech bubble — NOT rendered as a 3D mesh. Instead it stays as
    // a DOM overlay positioned via onCharacterScreenPosition (CSS fixed positioning).
    // This avoids perspective width distortion that occurs when the mesh is at the
    // edge of the viewport. When assistantTextStyle is 'borderless', the bubble
    // also stays as a DOM overlay.
    // The DOM overlay positioning handles the 'above the head' placement.

    // Message input area — centered slightly below
    const messageInput = document.querySelector('[data-ui3d-id="messageInput"]') as HTMLElement | null
    if (messageInput) {
      ensureVisibleBackground(messageInput)
      elements.messageInput = {
        dom: messageInput,
        position: new THREE.Vector3(0, -0.06, -1.3),
        scale: 0.5,
      }
    }

    viewer.syncUi3dMode(mode, elements)
    applyDomVisibility(mode)
  }

  // CSS Anchor Positioning bridge: update a hidden anchor element every frame
  // so the assistant speech bubble can use `anchor()` positioning.
  // Additionally, directly position the bubble element for browsers that don't
  // support anchor() or when the bubble is in html-in-canvas mode.
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
      // vh ranges 0 (viewport top) to 200 (viewport bottom), with 100 at center.
      // Normalize to CSS top: 0 = viewport top, 100 = viewport bottom.
      const topVh = vh / 2
      anchor.style.left = vw + 'vw'
      anchor.style.top = topVh + 'vh'
      // Also set CSS custom properties for anchor() fallback
      document.documentElement.style.setProperty(
        '--character-x-pct',
        vw.toString()
      )
      document.documentElement.style.setProperty(
        '--character-y-pct',
        vh.toString()
      )
      // Directly position the assistant text bubble element as a fallback
      // (also used as primary positioning in html-in-canvas mode since the
      // assistant text is NOT rendered as a 3D mesh — it stays as a DOM overlay).
      // Only reposition when assistantTextStyle is 'bubble'. When 'borderless',
      // the bubble stays in its natural Tailwind position (bottom of screen).
      const bubble = document.querySelector('[data-ui3d-id="assistantText"]') as HTMLElement | null
      if (bubble) {
        const style = settingsStore.getState().assistantTextStyle
        if (style === 'bubble') {
          // Position the outer wrapper element at the character's screen position.
          // Override all Tailwind positioning classes with inline fixed positioning.
          // topVh is normalized: 0 = viewport top, 100 = viewport bottom
          // Subtract 35vh so the bubble's bottom edge is 35% above the head position,
          // placing the bubble clearly above the avatar's head, not on the face.
          const offsetTop = Math.max(0, topVh - 35)
          bubble.style.setProperty('position', 'fixed', 'important')
          bubble.style.setProperty('left', vw + 'vw', 'important')
          bubble.style.setProperty('top', offsetTop + 'vh', 'important')
          bubble.style.setProperty('bottom', 'auto', 'important')
          bubble.style.setProperty('transform', 'translateX(-50%) translateY(-100%)', 'important')
          // Reset any margin/padding that could shift the bubble
          bubble.style.setProperty('margin', '0', 'important')
          // Make sure the bubble is visible in the viewport area
          bubble.style.setProperty('max-width', '680px', 'important')
          bubble.style.setProperty('width', 'auto', 'important')
          // Set z-index to ensure it's above the canvas
          bubble.style.setProperty('z-index', '50', 'important')
        } else {
          // 'borderless' style — remove any inline fixed positioning so the
          // bubble reverts to its natural Tailwind layout (bottom of screen).
          bubble.style.removeProperty('position')
          bubble.style.removeProperty('left')
          bubble.style.removeProperty('top')
          bubble.style.removeProperty('bottom')
          bubble.style.removeProperty('transform')
          bubble.style.removeProperty('margin')
          bubble.style.removeProperty('max-width')
          bubble.style.removeProperty('width')
          bubble.style.removeProperty('z-index')
        }
      }
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

      // Retry sync after a short delay to catch UI elements that mount
      // after the canvas (sibling components like Form/Menu)
      setTimeout(() => sync3dUi(), 100)

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
