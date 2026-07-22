/**
 * EJ (Emote Jockey) Controller Page
 *
 * A remote control panel for AITuberKit that can be opened from another browser
 * window or device on the same LAN. All controls send HTTP requests to the
 * AITuberKit server API.
 *
 * Layout: left column (speech, poses, settings) + right column (3DGS controls)
 * Fits within a 1080×720 viewport.
 *
 * Features:
 * - One-shot speech buttons with preset texts (editable, addable, deletable)
 * - Pose execution buttons for all configured poses
 * - All UI controls equivalent to the main screen (excluding Settings button)
 * - All 3DGS controller (splatControl) UI controls with x50 multiplier
 * - Conversation history reset button
 */
import { useEffect, useState, useCallback } from 'react'
import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import { ToggleSwitch } from '@/components/toggleSwitch'

// ─── Constants ────────────────────────────────────────────────────────

/** Splat movement/zoom/rotation multiplier (x50) */
const SPLAT_MULT = 50

/** Fine rotation increment (radians) — multiplied by SPLAT_MULT */
const ROT = 0.05

// ─── Types ────────────────────────────────────────────────────────────

interface SpeechPreset {
  id: string
  text: string
}

interface SplatFile {
  name: string
  size: number
  url: string
}

interface HdriFile {
  name: string
  size: number
  url: string
}

type Ui3dMode = 'css-overlay' | 'html-in-canvas'
type AssistantTextStyle = 'bubble' | 'borderless'
type ChatLogStyle = 'glass' | 'classic'
type ChatLogPosition = 'left' | 'right'
type BackgroundSwitchMode = 'manual' | 'timer'

// ─── Parse env var for initial presets ────────────────────────────────

function parseEnvPresets(): SpeechPreset[] {
  const envVal =
    typeof process !== 'undefined' &&
    typeof process.env?.NEXT_PUBLIC_EJ_SPEECH_PRESETS === 'string'
      ? process.env.NEXT_PUBLIC_EJ_SPEECH_PRESETS
      : null
  if (!envVal) return []
  try {
    const parsed = JSON.parse(envVal)
    if (Array.isArray(parsed)) {
      return parsed.map((t: string, i: number) => ({
        id: `preset-${i}`,
        text: String(t),
      }))
    }
  } catch {
    // ignore
  }
  return []
}

// ─── Presets from env ─────────────────────────────────────────────────

const ENV_PRESETS: SpeechPreset[] = parseEnvPresets()

// ─── API helper ───────────────────────────────────────────────────────

const API_BASE = typeof window !== 'undefined' ? window.location.origin : ''

async function sendCommand(
  command: string,
  extra: Record<string, unknown> = {}
): Promise<boolean> {
  try {
    const clientId =
      typeof window !== 'undefined'
        ? settingsStore.getState().clientId || 'default'
        : 'default'
    const res = await fetch(`${API_BASE}/api/command/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, clientId, ...extra }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '(no body)')
      console.error(
        `EJ Controller: /api/command POST failed (${res.status}): ${body}`
      )
    }
    return res.ok
  } catch (e) {
    console.error('EJ Controller: API call failed', e)
    return false
  }
}

async function sendSpeak(text: string): Promise<boolean> {
  try {
    const clientId =
      typeof window !== 'undefined'
        ? settingsStore.getState().clientId || 'default'
        : 'default'
    const url = new URL(`${API_BASE}/api/messages/`)
    url.searchParams.set('clientId', clientId)
    url.searchParams.set('type', 'direct_send')

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [text] }),
    })
    return res.ok
  } catch (e) {
    console.error('EJ Controller: speak failed', e)
    return false
  }
}

// ─── Component ────────────────────────────────────────────────────────

export default function EjController() {
  // ── State ────────────────────────────────────────────────────────────

  const [speechPresets, setSpeechPresets] = useState<SpeechPreset[]>(() => {
    return ENV_PRESETS.length > 0 ? ENV_PRESETS : [{ id: 'preset-0', text: '' }]
  })
  const [newPresetText, setNewPresetText] = useState('')

  const [poseList, setPoseList] = useState<
    { id: string; json?: string; sequence?: string[] }[]
  >([])

  const [splatFiles, setSplatFiles] = useState<SplatFile[]>([])
  const [hdriFiles, setHdriFiles] = useState<HdriFile[]>([])
  const [currentSplatUrl, setCurrentSplatUrl] = useState('')
  const [currentHdriUrl, setCurrentHdriUrl] = useState('')

  const [showAssistantText, setShowAssistantText] = useState(true)
  const [assistantTextStyle, setAssistantTextStyle] =
    useState<AssistantTextStyle>('bubble')
  const [chatLogStyle, setChatLogStyle] = useState<ChatLogStyle>('glass')
  const [chatLogPosition, setChatLogPosition] =
    useState<ChatLogPosition>('right')
  const [showCharacterName, setShowCharacterName] = useState(true)
  const [showControlPanel, setShowControlPanel] = useState(true)
  const [gaussianSplatEnabled, setGaussianSplatEnabled] = useState(false)
  const [ui3dMode, setUi3dMode] = useState<Ui3dMode>('css-overlay')
  const [showPresetQuestions, setShowPresetQuestions] = useState(false)
  const [messageReceiverEnabled, setMessageReceiverEnabled] = useState(false)
  const [useVideoAsBackground, setUseVideoAsBackground] = useState(false)
  const [backgroundSwitchMode, setBackgroundSwitchMode] =
    useState<BackgroundSwitchMode>('manual')
  const [backgroundSwitchInterval, setBackgroundSwitchInterval] = useState(60)
  const [uiDropShadowEnabled, setUiDropShadowEnabled] = useState(false)
  const [uiDarkMode, setUiDarkMode] = useState(false)

  // ── Fetch on mount ──────────────────────────────────────────────────

  useEffect(() => {
    fetch(`${API_BASE}/api/get-pose-list`)
      .then((r) => r.json())
      .then((files: { name: string; path: string }[]) => {
        const configs = settingsStore.getState().poseConfigs
        if (configs.length > 0) {
          setPoseList(
            configs.map((c) => ({
              id: c.id,
              json: 'json' in c ? c.json : undefined,
              sequence: 'sequence' in c ? c.sequence : undefined,
            }))
          )
        } else {
          setPoseList(
            files.map((f) => ({
              id: f.name,
              json: f.path,
            }))
          )
        }
      })
      .catch(() => setPoseList([]))

    fetch(`${API_BASE}/api/get-splat-list`)
      .then((r) => r.json())
      .then((files: SplatFile[]) => setSplatFiles(files))
      .catch(() => setSplatFiles([]))

    fetch(`${API_BASE}/api/get-hdri-list`)
      .then((r) => r.json())
      .then((files: HdriFile[]) => setHdriFiles(files))
      .catch(() => setHdriFiles([]))
  }, [])

  // ── Speech preset helpers ───────────────────────────────────────────

  const addPreset = () => {
    if (!newPresetText.trim()) return
    const newId = `preset-${Date.now()}`
    setSpeechPresets((prev) => [
      ...prev,
      { id: newId, text: newPresetText.trim() },
    ])
    setNewPresetText('')
  }

  const deletePreset = (id: string) => {
    setSpeechPresets((prev) => prev.filter((p) => p.id !== id))
  }

  const updatePresetText = (id: string, text: string) => {
    setSpeechPresets((prev) =>
      prev.map((p) => (p.id === id ? { ...p, text } : p))
    )
  }

  // ── Setting toggles ─────────────────────────────────────────────────

  const toggleSetting = (key: string, value: unknown) => {
    sendCommand('setting', { settingKey: key, settingValue: value })
    switch (key) {
      case 'showAssistantText':
        setShowAssistantText(value as boolean)
        break
      case 'assistantTextStyle':
        setAssistantTextStyle(value as AssistantTextStyle)
        break
      case 'chatLogStyle':
        setChatLogStyle(value as ChatLogStyle)
        break
      case 'chatLogPosition':
        setChatLogPosition(value as ChatLogPosition)
        break
      case 'showCharacterName':
        setShowCharacterName(value as boolean)
        break
      case 'showControlPanel':
        setShowControlPanel(value as boolean)
        break
      case 'gaussianSplatEnabled':
        setGaussianSplatEnabled(value as boolean)
        break
      case 'ui3dMode':
        setUi3dMode(value as Ui3dMode)
        break
      case 'showPresetQuestions':
        setShowPresetQuestions(value as boolean)
        break
      case 'messageReceiverEnabled':
        setMessageReceiverEnabled(value as boolean)
        break
      case 'useVideoAsBackground':
        setUseVideoAsBackground(value as boolean)
        break
      case 'backgroundSwitchMode':
        setBackgroundSwitchMode(value as BackgroundSwitchMode)
        break
      case 'backgroundSwitchInterval':
        setBackgroundSwitchInterval(value as number)
        break
      case 'uiDropShadowEnabled':
        setUiDropShadowEnabled(value as boolean)
        break
      case 'uiDarkMode':
        setUiDarkMode(value as boolean)
        break
    }
  }

  // ── Splat control helpers (all use SPLAT_MULT) ──────────────────────

  const splatMove = (dx: number, dy: number, dz: number = 0) => {
    sendCommand('splat', {
      splatAction: 'move',
      splatArgs: {
        dx: dx * SPLAT_MULT,
        dy: dy * SPLAT_MULT,
        dz: dz * SPLAT_MULT,
      },
    })
  }

  const splatZoom = (direction: number) => {
    // direction: +1 = zoom in, -1 = zoom out
    sendCommand('splat', {
      splatAction: 'zoom',
      splatArgs: { factor: 1 + direction * 0.02 * SPLAT_MULT },
    })
  }

  const splatRotate = (roll: number, pitch: number, yaw: number) => {
    sendCommand('splat', {
      splatAction: 'rotate',
      splatArgs: {
        roll: roll * SPLAT_MULT,
        pitch: pitch * SPLAT_MULT,
        yaw: yaw * SPLAT_MULT,
      },
    })
  }

  const splatFit = () => {
    sendCommand('splat', { splatAction: 'fit' })
  }

  const splatReset = () => {
    sendCommand('splat', { splatAction: 'reset' })
  }

  const splatHdriRotate = (degrees: number) => {
    sendCommand('splat', {
      splatAction: 'hdri-rotate',
      splatArgs: { degrees },
    })
  }

  const splatLoad = (url: string) => {
    sendCommand('splat', { splatAction: 'load', splatArgs: { url } })
    setCurrentSplatUrl(url)
  }

  const splatUnload = () => {
    sendCommand('splat', { splatAction: 'unload' })
    setCurrentSplatUrl('')
  }

  const hdriLoad = (url: string) => {
    sendCommand('splat', { splatAction: 'hdri-load', splatArgs: { url } })
    setCurrentHdriUrl(url)
  }

  const hdriUnload = () => {
    sendCommand('splat', { splatAction: 'hdri-unload' })
    setCurrentHdriUrl('')
  }

  // ── Pose helper ─────────────────────────────────────────────────────

  const applyPose = (poseId: string) => {
    sendCommand('pose', { poseId })
  }

  // ── Chat reset ──────────────────────────────────────────────────────

  const resetChat = () => {
    sendCommand('chat-reset')
  }

  // ── Stop ────────────────────────────────────────────────────────────

  const stopSpeech = () => {
    sendCommand('stop', { mode: 'all', reason: 'ej_controller' })
  }

  // ── HDRI slider state ───────────────────────────────────────────────

  const [hdriDeg, setHdriDeg] = useState(0)

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="h-[calc(100vh-2rem)] max-h-[720px] bg-gray-950 text-white p-4 overflow-hidden">
      {/* Header */}
      <div className="mb-3 shrink-0">
        <h1 className="text-lg font-bold tracking-tight">🎮 EJ Controller</h1>
        <p className="text-xs text-gray-400">Remote control for AITuberKit</p>
      </div>

      {/* ─────── TWO-COLUMN LAYOUT ─────── */}
      <div className="flex gap-4 h-[calc(100%-3rem)]">
        {/* ─── LEFT COLUMN ─── */}
        <div className="flex-1 flex flex-col gap-3 min-w-0 overflow-y-auto pr-1">
          {/* Speech */}
          <Section title="💬 One-Shot Speech">
            <div className="space-y-1.5 mb-2">
              {speechPresets.map((preset) => (
                <div key={preset.id} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder-gray-500"
                    value={preset.text}
                    onChange={(e) =>
                      updatePresetText(preset.id, e.target.value)
                    }
                    placeholder="Enter speech text..."
                  />
                  <button
                    className="px-2 py-1.5 bg-blue-700 hover:bg-blue-600 rounded text-xs font-medium transition-colors"
                    onClick={() => sendSpeak(preset.text)}
                    disabled={!preset.text.trim()}
                  >
                    ▶ Speak
                  </button>
                  <button
                    className="px-1.5 py-1.5 bg-red-800 hover:bg-red-700 rounded text-xs transition-colors"
                    onClick={() => deletePreset(preset.id)}
                    title="Delete preset"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Add new preset — Enter key does NOT trigger Add */}
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder-gray-500"
                value={newPresetText}
                onChange={(e) => setNewPresetText(e.target.value)}
                placeholder="New preset text..."
              />
              <button
                className="px-2 py-1.5 bg-green-800 hover:bg-green-700 rounded text-xs font-medium transition-colors disabled:opacity-40"
                onClick={addPreset}
                disabled={!newPresetText.trim()}
              >
                + Add
              </button>
            </div>

            <div className="mt-2">
              <button
                className="px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded text-xs font-bold transition-colors"
                onClick={stopSpeech}
              >
                ⏹ Stop Speech
              </button>
            </div>
          </Section>

          {/* Pose Execution */}
          <Section title="🧘 Pose Execution">
            {poseList.length === 0 ? (
              <p className="text-xs text-gray-500 italic">
                No poses configured.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {poseList.map((pose) => (
                  <button
                    key={pose.id}
                    className="px-2 py-1 bg-indigo-800 hover:bg-indigo-700 rounded text-xs font-medium transition-colors"
                    onClick={() => applyPose(pose.id)}
                  >
                    {pose.id}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-1.5">
              <button
                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
                onClick={() => sendCommand('pose', { poseId: '__reset__' })}
              >
                🔄 Reset to Idle
              </button>
            </div>
          </Section>

          {/* Settings Controls */}
          <Section title="⚙️ Settings">
            <div className="grid grid-cols-2 gap-1.5">
              <SettingToggle
                label="Assistant Text"
                enabled={showAssistantText}
                onChange={(v) => toggleSetting('showAssistantText', v)}
              />
              <SettingToggle
                label="Character Name"
                enabled={showCharacterName}
                onChange={(v) => toggleSetting('showCharacterName', v)}
              />
              <SettingToggle
                label="Control Panel"
                enabled={showControlPanel}
                onChange={(v) => toggleSetting('showControlPanel', v)}
              />
              <SettingToggle
                label="3DGS"
                enabled={gaussianSplatEnabled}
                onChange={(v) => toggleSetting('gaussianSplatEnabled', v)}
              />
              <SettingToggle
                label="Preset Qs"
                enabled={showPresetQuestions}
                onChange={(v) => toggleSetting('showPresetQuestions', v)}
              />
              <SettingToggle
                label="Msg Receiver"
                enabled={messageReceiverEnabled}
                onChange={(v) => toggleSetting('messageReceiverEnabled', v)}
              />
              <SettingToggle
                label="Video BG"
                enabled={useVideoAsBackground}
                onChange={(v) => toggleSetting('useVideoAsBackground', v)}
              />
              <SettingToggle
                label="Drop Shadow"
                enabled={uiDropShadowEnabled}
                onChange={(v) => toggleSetting('uiDropShadowEnabled', v)}
              />
              <SettingToggle
                label="Dark Mode"
                enabled={uiDarkMode}
                onChange={(v) => toggleSetting('uiDarkMode', v)}
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              <SettingSelect
                label="Text Style"
                value={assistantTextStyle}
                options={[
                  { value: 'bubble', label: 'Bubble' },
                  { value: 'borderless', label: 'Borderless' },
                ]}
                onChange={(v) => toggleSetting('assistantTextStyle', v)}
              />
              <SettingSelect
                label="Log Style"
                value={chatLogStyle}
                options={[
                  { value: 'glass', label: 'Glass' },
                  { value: 'classic', label: 'Classic' },
                ]}
                onChange={(v) => toggleSetting('chatLogStyle', v)}
              />
              <SettingSelect
                label="Log Position"
                value={chatLogPosition}
                options={[
                  { value: 'right', label: 'Right' },
                  { value: 'left', label: 'Left' },
                ]}
                onChange={(v) => toggleSetting('chatLogPosition', v)}
              />
              <SettingSelect
                label="3D UI Mode"
                value={ui3dMode}
                options={[
                  { value: 'css-overlay', label: 'CSS Overlay' },
                  { value: 'html-in-canvas', label: 'HTML-in-Canvas' },
                ]}
                onChange={(v) => toggleSetting('ui3dMode', v)}
              />
              <SettingSelect
                label="BG Switch"
                value={backgroundSwitchMode}
                options={[
                  { value: 'manual', label: 'Manual' },
                  { value: 'timer', label: 'Timer' },
                ]}
                onChange={(v) => toggleSetting('backgroundSwitchMode', v)}
              />
            </div>

            {/* Reset conversation */}
            <div className="mt-2 pt-2 border-t border-gray-700">
              <button
                className="px-3 py-1.5 bg-red-800 hover:bg-red-700 rounded text-xs font-bold transition-colors"
                onClick={resetChat}
              >
                🗑 Reset Chat
              </button>
            </div>
          </Section>
        </div>

        {/* ─── RIGHT COLUMN: 3DGS Controls ─── */}
        <div className="w-[340px] shrink-0 overflow-y-auto">
          <Section title="🎯 3DGS Controls">
            {/* Splat file selector */}
            {splatFiles.length > 0 && (
              <div className="flex items-center gap-1.5 mb-2">
                <select
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                  value={currentSplatUrl}
                  onChange={(e) => splatLoad(e.target.value)}
                >
                  <option value="">-- Select splat --</option>
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
                  className="px-1.5 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
                  onClick={splatUnload}
                >
                  Clear
                </button>
              </div>
            )}

            {/* HDRI file selector */}
            {hdriFiles.length > 0 && (
              <div className="flex items-center gap-1.5 mb-2">
                <select
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                  value={currentHdriUrl}
                  onChange={(e) => hdriLoad(e.target.value)}
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
                  className="px-1.5 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
                  onClick={hdriUnload}
                >
                  Clear
                </button>
              </div>
            )}

            {/* ─────── MOVEMENT (3-axis grid with row-start) ─────── */}
            <div className="mb-2">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                Movement (×{SPLAT_MULT})
              </div>
              <div className="grid grid-cols-3 gap-1 w-[132px]">
                {/* Row 1: Y+ up (col 2) */}
                <div className="col-start-2 row-start-1">
                  <SplatBtn icon="↑" onClick={() => splatMove(0, 1, 0)} />
                </div>
                {/* Row 2: X- left (col 1), center / fit (col 2), X+ right (col 3) */}
                <div className="col-start-1 row-start-2">
                  <SplatBtn icon="←" onClick={() => splatMove(-1, 0, 0)} />
                </div>
                <div className="col-start-2 row-start-2 flex items-center justify-center">
                  <SplatBtn icon="◉" onClick={splatFit} label="Fit" />
                </div>
                <div className="col-start-3 row-start-2">
                  <SplatBtn icon="→" onClick={() => splatMove(1, 0, 0)} />
                </div>
                {/* Row 3: Y- down (col 2) */}
                <div className="col-start-2 row-start-3">
                  <SplatBtn icon="↓" onClick={() => splatMove(0, -1, 0)} />
                </div>
                {/* Row 4: Z-axis back (col 1), forward (col 3) */}
                <div className="col-start-1 row-start-4">
                  <SplatBtn
                    icon="↕"
                    onClick={() => splatMove(0, 0, -1)}
                    label="Back"
                  />
                </div>
                <div className="col-start-3 row-start-4">
                  <SplatBtn
                    icon="↕"
                    onClick={() => splatMove(0, 0, 1)}
                    label="Forward"
                  />
                </div>
              </div>
            </div>

            {/* ─────── ZOOM ─────── */}
            <div className="mb-2">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                Zoom (×{SPLAT_MULT})
              </div>
              <div className="flex gap-1.5">
                <SplatBtn icon="−" onClick={() => splatZoom(-1)} label="Out" />
                <SplatBtn icon="+" onClick={() => splatZoom(1)} label="In" />
              </div>
            </div>

            {/* ─────── ROTATION ─────── */}
            <div className="mb-2">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                Rotation (×{SPLAT_MULT})
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 w-3">R</span>
                  <SplatBtn icon="⟳" onClick={() => splatRotate(ROT, 0, 0)} />
                  <SplatBtn icon="⟲" onClick={() => splatRotate(-ROT, 0, 0)} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 w-3">P</span>
                  <SplatBtn icon="↑" onClick={() => splatRotate(0, ROT, 0)} />
                  <SplatBtn icon="↓" onClick={() => splatRotate(0, -ROT, 0)} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 w-3">Y</span>
                  <SplatBtn icon="↺" onClick={() => splatRotate(0, 0, -ROT)} />
                  <SplatBtn icon="↻" onClick={() => splatRotate(0, 0, ROT)} />
                </div>
              </div>
            </div>

            {/* ─────── PRESET ROTATION ─────── */}
            <div className="mb-2">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                Preset Rotation
              </div>
              <div className="flex flex-wrap gap-1">
                <PresetBtn
                  label="90° L"
                  onClick={() => splatRotate(-Math.PI / 2, 0, 0)}
                />
                <PresetBtn
                  label="90° R"
                  onClick={() => splatRotate(Math.PI / 2, 0, 0)}
                />
                <PresetBtn
                  label="180°"
                  onClick={() => splatRotate(Math.PI, 0, 0)}
                />
                <PresetBtn
                  label="90° ↓"
                  onClick={() => splatRotate(0, -Math.PI / 2, 0)}
                />
                <PresetBtn
                  label="90° ↑"
                  onClick={() => splatRotate(0, Math.PI / 2, 0)}
                />
                <PresetBtn
                  label="Y 90° L"
                  onClick={() => splatRotate(0, 0, -Math.PI / 2)}
                />
                <PresetBtn
                  label="Y 90° R"
                  onClick={() => splatRotate(0, 0, Math.PI / 2)}
                />
              </div>
            </div>

            {/* ─────── ACTION BUTTONS ─────── */}
            <div className="flex gap-1.5 mb-2">
              <button
                className="flex-1 px-2 py-1.5 bg-blue-800 hover:bg-blue-700 rounded text-xs font-medium transition-colors"
                onClick={splatFit}
              >
                画面内に収める
              </button>
              <button
                className="flex-1 px-2 py-1.5 bg-green-800 hover:bg-green-700 rounded text-xs font-medium transition-colors"
                onClick={splatReset}
              >
                初期位置にリセット
              </button>
            </div>

            {/* ─────── HDRI ROTATION (step=10) ─────── */}
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                HDRI Rotation (10° steps)
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  className="flex-1 accent-cyan-400 bg-gray-700 rounded appearance-none cursor-pointer"
                  min={-180}
                  max={180}
                  step={10}
                  value={hdriDeg}
                  onChange={(e) => {
                    const deg = parseInt(e.target.value, 10)
                    setHdriDeg(deg)
                    splatHdriRotate(deg)
                  }}
                />
                <span className="text-[10px] text-cyan-300 w-10 text-right font-mono tabular-nums">
                  {hdriDeg}°
                </span>
              </div>
            </div>
          </Section>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-2 pt-1 border-t border-gray-700 text-center text-[9px] text-gray-500 shrink-0">
        EJ Controller · Remote control for AITuberKit
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="p-3 bg-gray-900 rounded-xl border border-gray-800">
      <h2 className="text-sm font-bold mb-2">{title}</h2>
      {children}
    </div>
  )
}

function SettingToggle({
  label,
  enabled,
  onChange,
}: {
  label: string
  enabled: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 bg-gray-800 rounded-lg">
      <span className="text-[11px] text-gray-300">{label}</span>
      <ToggleSwitch enabled={enabled} onChange={onChange} />
    </div>
  )
}

function SettingSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="px-2 py-1.5 bg-gray-800 rounded-lg">
      <div className="text-[9px] text-gray-400 mb-0.5">{label}</div>
      <select
        className="w-full bg-transparent border border-gray-700 rounded px-1 py-0.5 text-[11px] text-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function SplatBtn({
  icon,
  onClick,
  label,
}: {
  icon: string
  onClick: () => void
  label?: string
}) {
  return (
    <button
      className="w-9 h-9 rounded bg-gray-700 hover:bg-gray-600 active:bg-gray-500
                 flex items-center justify-center text-white text-sm
                 transition-colors select-none"
      onClick={onClick}
      title={label}
      aria-label={label || icon}
    >
      {icon}
    </button>
  )
}

function PresetBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="px-2 py-1 bg-amber-800 hover:bg-amber-700 rounded text-[10px] font-medium transition-colors"
      onClick={onClick}
    >
      {label}
    </button>
  )
}
