import { useEffect, useRef, useState } from 'react'
import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import { logger } from '@/lib/logger'

/** Per-splat-file persisted state stored in localStorage */
interface SplatPersistState {
  position: [number, number, number]
  scale: number
  quaternion: [number, number, number, number]
  opacity: number
  rotationOffset: [number, number, number]
  hdriUrl: string
  hdriRotation: number
}

/** Build a localStorage key for a given splat file name. */
function splatStorageKey(splatName: string): string {
  return `3dgs-state-${splatName}`
}

/** Read persisted state from localStorage for a given splat file. */
function loadSplatPersist(splatName: string): SplatPersistState | null {
  try {
    const raw = localStorage.getItem(splatStorageKey(splatName))
    if (!raw) return null
    return JSON.parse(raw) as SplatPersistState
  } catch {
    return null
  }
}

/** Write persisted state to localStorage for a given splat file. */
function saveSplatPersist(splatName: string, state: SplatPersistState): void {
  try {
    localStorage.setItem(splatStorageKey(splatName), JSON.stringify(state))
  } catch (e) {
    logger.error('Failed to persist 3DGS state:', e)
  }
}

/** Extract the filename from a splat URL (e.g., '/splats/House.sog' → 'House.sog'). */
function splatNameFromUrl(url: string): string {
  const parts = url.split('/')
  return parts[parts.length - 1] || 'default'
}

/**
 * Floating overlay with movement/zoom/rotation controls for the 3DGS splat scene,
 * independent of the VRM avatar camera controls.
 *
 * Keyboard shortcuts (when 3DGS is enabled and not typing in a field):
 *   Arrow keys  — move splat up/down/left/right
 *   +/-         — zoom in/out
 *   Q / E       — roll counter-clockwise / clockwise
 *   W / S       — pitch up / down
 *   A / D       — yaw left / right
 *   R           — fit splat centered in viewport (画面内に収める)
 *   G           — reset splat to initial position (初期位置にリセット)
 */
export default function SplatControls() {
  const gaussianSplatEnabled = settingsStore((s) => s.gaussianSplatEnabled)
  const gaussianSplatLoading = homeStore((s) => s.gaussianSplatLoading)
  const gaussianSplatError = homeStore((s) => s.gaussianSplatError)
  const gaussianSplatControlsVisible = homeStore(
    (s) => s.gaussianSplatControlsVisible
  )
  const gaussianSplatUrl = homeStore((s) => s.gaussianSplatUrl)
  const gaussianSplatOpacity = homeStore((s) => s.gaussianSplatOpacity)
  const gaussianSplatScale = homeStore((s) => s.gaussianSplatScale)
  const gaussianSplatHdriUrl = homeStore((s) => s.gaussianSplatHdriUrl)
  const gaussianSplatHdriRotation = homeStore(
    (s) => s.gaussianSplatHdriRotation
  )
  const gaussianSplatRotationOffset = homeStore(
    (s) => s.gaussianSplatRotationOffset
  )

  const [multiplier, setMultiplier] = useState(1)
  const [splatFiles, setSplatFiles] = useState<
    { name: string; size: number; url: string }[] | null
  >(null)
  const [hdriFiles, setHdriFiles] = useState<
    { name: string; size: number; url: string }[] | null
  >(null)

  // Fetch local splat and HDRI file lists on mount
  useEffect(() => {
    fetch('/api/get-splat-list')
      .then((res) => res.json())
      .then((files: { name: string; size: number; url: string }[]) => {
        setSplatFiles(files)
      })
      .catch((error) => {
        logger.error('Error fetching splat list:', error)
        setSplatFiles([])
      })

    fetch('/api/get-hdri-list')
      .then((res) => res.json())
      .then((files: { name: string; size: number; url: string }[]) => {
        setHdriFiles(files)
      })
      .catch((error) => {
        logger.error('Error fetching HDRI list:', error)
        setHdriFiles([])
      })
  }, [])

  // ── localStorage persistence ───────────────────────────────────────
  // Determine the current splat file name for localStorage keys.
  const currentSplatName = gaussianSplatUrl
    ? splatNameFromUrl(gaussianSplatUrl)
    : null

  // Save current state to localStorage whenever relevant values change.
  useEffect(() => {
    if (!currentSplatName) return
    saveSplatPersist(currentSplatName, {
      position: [0, 0, 0],
      scale: gaussianSplatScale,
      quaternion: [1, 0, 0, 0],
      opacity: gaussianSplatOpacity,
      rotationOffset: gaussianSplatRotationOffset,
      hdriUrl: gaussianSplatHdriUrl,
      hdriRotation: gaussianSplatHdriRotation,
    })
  }, [
    currentSplatName,
    gaussianSplatScale,
    gaussianSplatOpacity,
    gaussianSplatRotationOffset,
    gaussianSplatHdriUrl,
    gaussianSplatHdriRotation,
  ])

  // Track previous loading state to detect when loading finishes.
  const prevLoadingRef = useRef(gaussianSplatLoading)
  useEffect(() => {
    prevLoadingRef.current = gaussianSplatLoading
  })

  // When loading finishes (transitioned from true to false), restore
  // saved mesh position/scale/quaternion from localStorage.
  useEffect(() => {
    if (prevLoadingRef.current && !gaussianSplatLoading && currentSplatName) {
      const saved = loadSplatPersist(currentSplatName)
      if (saved) {
        const viewer = homeStore.getState().viewer
        if (viewer) {
          viewer.setSplatScale(saved.scale)
          viewer.setSplatOpacity(saved.opacity)

          // Restore HDRI if previously set
          if (saved.hdriUrl && saved.hdriUrl !== gaussianSplatHdriUrl) {
            homeStore.setState({ gaussianSplatHdriUrl: saved.hdriUrl })
            viewer.loadSplatHdri(saved.hdriUrl)
          }
          viewer.setSplatHdriRotation(saved.hdriRotation)
          homeStore.setState({ gaussianSplatHdriRotation: saved.hdriRotation })
          homeStore.setState({
            gaussianSplatRotationOffset: saved.rotationOffset,
          })

          // Apply position and quaternion after a brief delay to ensure mesh is ready
          setTimeout(() => {
            const mesh = (viewer as any)['_splatMesh']
            if (mesh) {
              mesh.position.set(
                saved.position[0],
                saved.position[1],
                saved.position[2]
              )
              mesh.quaternion.set(
                saved.quaternion[0],
                saved.quaternion[1],
                saved.quaternion[2],
                saved.quaternion[3]
              )
            }
          }, 100)
        }
      }
    }
  }, [gaussianSplatLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!gaussianSplatEnabled || gaussianSplatLoading || gaussianSplatError) {
    return null
  }

  if (!gaussianSplatControlsVisible) {
    return null
  }

  const move = (dx: number, dy: number, dz: number = 0) => {
    const viewer = homeStore.getState().viewer
    viewer?.moveSplat(dx * multiplier, dy * multiplier, dz * multiplier)
  }

  const zoom = (factor: number) => {
    const viewer = homeStore.getState().viewer
    viewer?.zoomSplat(factor)
  }

  const rotate = (roll: number, pitch: number, yaw: number) => {
    const viewer = homeStore.getState().viewer
    viewer?.rotateSplat(roll, pitch, yaw)
  }

  const fitViewport = () => {
    const viewer = homeStore.getState().viewer
    viewer?.fitSplatToViewport()
  }

  const resetInitialPosition = () => {
    const viewer = homeStore.getState().viewer
    viewer?.resetSplatToInitialPosition()
  }

  const ROT = 0.05

  return (
    <div className="absolute bottom-6 right-6 z-30">
      {/* Glass-style panel */}
      <div className="flex flex-col items-center gap-1.5 bg-gray-900/70 backdrop-blur-sm rounded-xl p-2 shadow-lg border border-white/10">
        {/* Header row with label and close button */}
        <div className="flex items-center justify-between w-full">
          <div className="text-[9px] text-gray-400 tracking-wider uppercase text-center flex-1">
            3DGS Controls
          </div>
          <button
            className="w-5 h-5 rounded bg-gray-700/60 hover:bg-gray-600/80 active:bg-gray-500/80
                       flex items-center justify-center text-[9px] text-gray-400
                       transition-colors duration-150 ml-1"
            onClick={() =>
              homeStore.setState({ gaussianSplatControlsVisible: false })
            }
            title="Hide controls (H key)"
            aria-label="Hide controls"
          >
            ✕
          </button>
        </div>

        {/* ─────── LOCAL SPLAT FILE PICKER ─────── */}
        {splatFiles && splatFiles.length > 0 && (
          <div className="flex items-center gap-1 w-full">
            <select
              className="flex-1 bg-transparent border border-white/30 rounded px-1 py-1 text-[9px] text-white"
              value={gaussianSplatUrl}
              onChange={(e) => {
                const url = e.target.value
                if (url) {
                  // Save current state before switching splat files
                  if (currentSplatName) {
                    const viewer = homeStore.getState().viewer
                    const mesh = (viewer as any)?.['_splatMesh']
                    if (mesh) {
                      saveSplatPersist(currentSplatName, {
                        position: [
                          mesh.position.x,
                          mesh.position.y,
                          mesh.position.z,
                        ],
                        scale: gaussianSplatScale,
                        quaternion: [
                          mesh.quaternion.w,
                          mesh.quaternion.x,
                          mesh.quaternion.y,
                          mesh.quaternion.z,
                        ],
                        opacity: gaussianSplatOpacity,
                        rotationOffset: gaussianSplatRotationOffset,
                        hdriUrl: gaussianSplatHdriUrl,
                        hdriRotation: gaussianSplatHdriRotation,
                      })
                    }
                  }
                  homeStore.setState({ gaussianSplatUrl: url })
                  const viewer = homeStore.getState().viewer
                  viewer?.loadSplatScene(url)
                }
              }}
            >
              <option value="">-- Select local splat --</option>
              {splatFiles.map((f) => {
                const sizeMB = (f.size / 1024 / 1024).toFixed(1)
                return (
                  <option key={f.url} value={f.url}>
                    {f.name} ({sizeMB} MB)
                  </option>
                )
              })}
            </select>
            <button
              className="text-[9px] bg-gray-600 hover:bg-gray-500 px-1.5 py-1 rounded transition-colors whitespace-nowrap"
              onClick={() => {
                const viewer = homeStore.getState().viewer
                viewer?.unloadSplatScene()
                homeStore.setState({ gaussianSplatUrl: '' })
              }}
            >
              Clear
            </button>
          </div>
        )}

        {/* === MOVEMENT (3-axis) === */}
        {/* 4×3 grid with explicit row/col placement */}
        <div className="grid grid-cols-3 gap-1">
          {/* Row 1: Y+ up (col 2) */}
          <div className="col-start-2 row-start-1">
            <SplatButton
              icon="↑"
              onClick={() => move(0, 1, 0)}
              label="Move up"
            />
          </div>
          {/* Row 2: X- left (col 1), center / fit (col 2), X+ right (col 3) */}
          <div className="col-start-1 row-start-2">
            <SplatButton
              icon="←"
              onClick={() => move(-1, 0, 0)}
              label="Move left"
            />
          </div>
          <div className="col-start-2 row-start-2 flex items-center justify-center w-9 h-9">
            <button
              className="w-full h-full rounded bg-gray-700/60 hover:bg-gray-600/80 active:bg-gray-500/80
                         flex items-center justify-center text-[9px] text-gray-300 font-bold leading-tight
                         transition-colors duration-150"
              onClick={fitViewport}
              title="Fit in screen (R key)"
              aria-label="Fit in screen"
            >
              ◉
            </button>
          </div>
          <div className="col-start-3 row-start-2">
            <SplatButton
              icon="→"
              onClick={() => move(1, 0, 0)}
              label="Move right"
            />
          </div>
          {/* Row 3: Y- down (col 2) */}
          <div className="col-start-2 row-start-3">
            <SplatButton
              icon="↓"
              onClick={() => move(0, -1, 0)}
              label="Move down"
            />
          </div>
          {/* Row 4: Z-axis — back (col 1), forward (col 3) */}
          <div className="col-start-1 row-start-4">
            <SplatButton
              icon="↕"
              onClick={() => move(0, 0, -1)}
              label="Move backward (Z-)"
            />
          </div>
          <div className="col-start-3 row-start-4">
            <SplatButton
              icon="↕"
              onClick={() => move(0, 0, 1)}
              label="Move forward (Z+)"
            />
          </div>
        </div>

        {/* === ZOOM === */}
        <div className="flex gap-1">
          <SplatButton icon="−" onClick={() => zoom(0.9)} label="Zoom out" />
          <SplatButton icon="+" onClick={() => zoom(1.1)} label="Zoom in" />
        </div>

        {/* === MULTIPLIER === */}
        <div className="flex items-center gap-1 w-full">
          <span className="text-[9px] text-gray-500">
            {multiplier === 1 ? '1×' : `×${multiplier}`}
          </span>
          <button
            className="flex-1 h-6 rounded bg-purple-800/40 hover:bg-purple-700/60 active:bg-purple-600/70
                       flex items-center justify-center text-[9px] text-purple-300 font-medium
                       transition-colors duration-150"
            onClick={() => setMultiplier(10)}
            title="Set movement multiplier to x10 (hold Shift)"
          >
            x10
          </button>
          <button
            className="flex-1 h-6 rounded bg-purple-800/40 hover:bg-purple-700/60 active:bg-purple-600/70
                       flex items-center justify-center text-[9px] text-purple-300 font-medium
                       transition-colors duration-150"
            onClick={() => setMultiplier(100)}
            title="Set movement multiplier to x100 (hold Shift+Option)"
          >
            x100
          </button>
          {multiplier > 1 && (
            <button
              className="h-6 w-6 rounded bg-gray-700/60 hover:bg-gray-600/80 active:bg-gray-500/80
                         flex items-center justify-center text-[9px] text-gray-300
                         transition-colors duration-150"
              onClick={() => setMultiplier(1)}
              title="Reset multiplier to 1×"
            >
              ✕
            </button>
          )}
        </div>

        {/* === FINE ROTATION === */}
        <div className="flex flex-col gap-0.5 w-full">
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-gray-500 w-6 text-right">R</span>
            <SplatButton
              icon="⟳"
              onClick={() => rotate(ROT, 0, 0)}
              label="Roll clockwise (E)"
            />
            <SplatButton
              icon="⟲"
              onClick={() => rotate(-ROT, 0, 0)}
              label="Roll counter-clockwise (Q)"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-gray-500 w-6 text-right">P</span>
            <SplatButton
              icon="↑"
              onClick={() => rotate(0, ROT, 0)}
              label="Pitch up (W)"
            />
            <SplatButton
              icon="↓"
              onClick={() => rotate(0, -ROT, 0)}
              label="Pitch down (S)"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-gray-500 w-6 text-right">Y</span>
            <SplatButton
              icon="↺"
              onClick={() => rotate(0, 0, -ROT)}
              label="Yaw left (A)"
            />
            <SplatButton
              icon="↻"
              onClick={() => rotate(0, 0, ROT)}
              label="Yaw right (D)"
            />
          </div>
        </div>

        {/* === PRESET ROTATION === */}
        <div className="flex gap-1 w-full">
          <span className="text-[9px] text-gray-500 w-6 text-right leading-7">
            R
          </span>
          <button
            className="flex-1 h-7 rounded bg-amber-800/40 hover:bg-amber-700/60 active:bg-amber-600/70
                       flex items-center justify-center text-[9px] text-amber-300 font-medium
                       transition-colors duration-150"
            onClick={() => rotate(-Math.PI / 2, 0, 0)}
            title="Roll 90° counter-clockwise"
          >
            90° L
          </button>
          <button
            className="flex-1 h-7 rounded bg-amber-800/40 hover:bg-amber-700/60 active:bg-amber-600/70
                       flex items-center justify-center text-[9px] text-amber-300 font-medium
                       transition-colors duration-150"
            onClick={() => rotate(Math.PI / 2, 0, 0)}
            title="Roll 90° clockwise"
          >
            90° R
          </button>
          <button
            className="flex-1 h-7 rounded bg-amber-800/40 hover:bg-amber-700/60 active:bg-amber-600/70
                       flex items-center justify-center text-[9px] text-amber-300 font-medium
                       transition-colors duration-150"
            onClick={() => rotate(Math.PI, 0, 0)}
            title="Roll 180°"
          >
            180°
          </button>
        </div>
        <div className="flex gap-1 w-full">
          <span className="text-[9px] text-gray-500 w-6 text-right leading-7">
            P
          </span>
          <button
            className="flex-1 h-7 rounded bg-amber-800/40 hover:bg-amber-700/60 active:bg-amber-600/70
                       flex items-center justify-center text-[9px] text-amber-300 font-medium
                       transition-colors duration-150"
            onClick={() => rotate(0, -Math.PI / 2, 0)}
            title="Pitch 90° down"
          >
            90° ↓
          </button>
          <button
            className="flex-1 h-7 rounded bg-amber-800/40 hover:bg-amber-700/60 active:bg-amber-600/70
                       flex items-center justify-center text-[9px] text-amber-300 font-medium
                       transition-colors duration-150"
            onClick={() => rotate(0, Math.PI / 2, 0)}
            title="Pitch 90° up"
          >
            90° ↑
          </button>
          <button
            className="flex-1 h-7 rounded bg-amber-800/40 hover:bg-amber-700/60 active:bg-amber-600/70
                       flex items-center justify-center text-[9px] text-amber-300 font-medium
                       transition-colors duration-150"
            onClick={() => rotate(0, Math.PI, 0)}
            title="Pitch 180°"
          >
            180°
          </button>
        </div>
        <div className="flex gap-1 w-full">
          <span className="text-[9px] text-gray-500 w-6 text-right leading-7">
            Y
          </span>
          <button
            className="flex-1 h-7 rounded bg-amber-800/40 hover:bg-amber-700/60 active:bg-amber-600/70
                       flex items-center justify-center text-[9px] text-amber-300 font-medium
                       transition-colors duration-150"
            onClick={() => rotate(0, 0, -Math.PI / 2)}
            title="Yaw 90° left"
          >
            90° L
          </button>
          <button
            className="flex-1 h-7 rounded bg-amber-800/40 hover:bg-amber-700/60 active:bg-amber-600/70
                       flex items-center justify-center text-[9px] text-amber-300 font-medium
                       transition-colors duration-150"
            onClick={() => rotate(0, 0, Math.PI / 2)}
            title="Yaw 90° right"
          >
            90° R
          </button>
          <button
            className="flex-1 h-7 rounded bg-amber-800/40 hover:bg-amber-700/60 active:bg-amber-600/70
                       flex items-center justify-center text-[9px] text-amber-300 font-medium
                       transition-colors duration-150"
            onClick={() => rotate(0, 0, Math.PI)}
            title="Yaw 180°"
          >
            180°
          </button>
        </div>

        {/* ─────── HDRI BACKGROUND SELECTOR ─────── */}
        {hdriFiles && hdriFiles.length > 0 && (
          <div className="flex items-center gap-1 w-full">
            <select
              className="flex-1 bg-transparent border border-white/30 rounded px-1 py-1 text-[9px] text-white"
              value={gaussianSplatHdriUrl}
              onChange={(e) => {
                const url = e.target.value
                homeStore.setState({ gaussianSplatHdriUrl: url })
                if (url) {
                  const viewer = homeStore.getState().viewer
                  viewer?.loadSplatHdri(url)
                }
              }}
            >
              <option value="">-- Select HDRI --</option>
              {hdriFiles.map((f) => {
                const sizeMB = (f.size / 1024 / 1024).toFixed(1)
                return (
                  <option key={f.url} value={f.url}>
                    {f.name} ({sizeMB} MB)
                  </option>
                )
              })}
            </select>
            <button
              className="text-[9px] bg-gray-600 hover:bg-gray-500 px-1.5 py-1 rounded transition-colors whitespace-nowrap"
              onClick={() => {
                const viewer = homeStore.getState().viewer
                viewer?.unloadSplatHdri()
                homeStore.setState({ gaussianSplatHdriUrl: '' })
              }}
            >
              Clear
            </button>
          </div>
        )}

        {/* === HDRI ROTATION === */}
        <div className="flex flex-col gap-1 w-full">
          <div className="text-[9px] text-gray-400 tracking-wider uppercase">
            HDRI Rotation
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              className="flex-1 h-5 accent-cyan-400 bg-gray-700/60 rounded appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                         [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:shadow-md"
              min={-180}
              max={180}
              step={1}
              value={gaussianSplatHdriRotation}
              onChange={(e) => {
                const deg = parseInt(e.target.value, 10)
                homeStore.setState({ gaussianSplatHdriRotation: deg })
                const viewer = homeStore.getState().viewer
                viewer?.setSplatHdriRotation(deg)
              }}
            />
            <span className="text-[10px] text-cyan-300 w-10 text-right font-mono tabular-nums">
              {gaussianSplatHdriRotation}°
            </span>
          </div>
        </div>

        {/* === ACTION BUTTONS === */}
        <div className="flex gap-1 w-full">
          <button
            className="flex-1 h-7 rounded bg-blue-800/40 hover:bg-blue-700/60 active:bg-blue-600/70
                       flex items-center justify-center text-[9px] text-blue-300 font-medium
                       transition-colors duration-150"
            onClick={fitViewport}
            title="Fit in screen (R key)"
          >
            画面内に収める
          </button>
          <button
            className="flex-1 h-7 rounded bg-green-800/40 hover:bg-green-700/60 active:bg-green-600/70
                       flex items-center justify-center text-[9px] text-green-300 font-medium
                       transition-colors duration-150"
            onClick={resetInitialPosition}
            title="Reset to initial position (G key)"
          >
            初期位置にリセット
          </button>
        </div>

        {/* Keyboard hint */}
        <div className="text-[8px] text-gray-500 text-center leading-tight">
          ↑↓←→ move · +/- zoom · QWES/AD rotate · R/G reset · H toggle
        </div>
      </div>
    </div>
  )
}

function SplatButton({
  icon,
  onClick,
  label,
}: {
  icon: string
  onClick: () => void
  label: string
}) {
  return (
    <button
      className="w-9 h-9 rounded bg-gray-700/60 hover:bg-gray-600/80 active:bg-gray-500/80
                 flex items-center justify-center text-white text-base
                 transition-colors duration-150 select-none"
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  )
}
