/**
 * EJ (Emote Jockey) Controller Page
 *
 * A remote control panel for AITuberKit that can be opened from another browser
 * window or device on the same LAN. All controls send HTTP requests to the
 * AITuberKit server API.
 *
 * Features:
 * - One-shot speech buttons with preset texts (editable, addable, deletable)
 * - Pose execution buttons for all configured poses
 * - All UI controls equivalent to the main screen (excluding Settings button)
 * - All 3DGS controller (splatControl) UI controls
 * - Conversation history reset button
 */
import { useEffect, useState, useCallback } from 'react'
import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import { ToggleSwitch } from '@/components/toggleSwitch'

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
    const res = await fetch(`${API_BASE}/api/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, ...extra }),
    })
    return res.ok
  } catch (e) {
    console.error('EJ Controller: API call failed', e)
    return false
  }
}

async function sendSpeak(text: string): Promise<boolean> {
  try {
    // Get clientId from settings store (fall back to 'default')
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
      body: JSON.stringify({
        messages: [text],
      }),
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

  // Speech presets
  const [speechPresets, setSpeechPresets] = useState<SpeechPreset[]>(() => {
    // Start with env presets, add one default blank
    return ENV_PRESETS.length > 0 ? ENV_PRESETS : [{ id: 'preset-0', text: '' }]
  })
  const [newPresetText, setNewPresetText] = useState('')

  // Pose list
  const [poseList, setPoseList] = useState<
    { id: string; json?: string; sequence?: string[] }[]
  >([])

  // Splat file list
  const [splatFiles, setSplatFiles] = useState<SplatFile[]>([])
  const [hdriFiles, setHdriFiles] = useState<HdriFile[]>([])
  const [currentSplatUrl, setCurrentSplatUrl] = useState('')
  const [currentHdriUrl, setCurrentHdriUrl] = useState('')

  // Settings from store (read-only snapshot via API)
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

  // ── Fetch pose list on mount ────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/api/get-pose-list`)
      .then((r) => r.json())
      .then((files: { name: string; path: string }[]) => {
        // Use poseConfigs from settings for IDs
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
          // Fall back to file names
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
    // Also update local state for immediate UI feedback
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

  // ── Splat control helpers ───────────────────────────────────────────

  const splatMove = (dx: number, dy: number, dz: number = 0) => {
    sendCommand('splat', { splatAction: 'move', splatArgs: { dx, dy, dz } })
  }

  const splatZoom = (factor: number) => {
    sendCommand('splat', { splatAction: 'zoom', splatArgs: { factor } })
  }

  const splatRotate = (roll: number, pitch: number, yaw: number) => {
    sendCommand('splat', {
      splatAction: 'rotate',
      splatArgs: { roll, pitch, yaw },
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

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">🎮 EJ Controller</h1>
        <p className="text-sm text-gray-400 mt-1">
          Remote control panel for AITuberKit
        </p>
      </div>

      {/* ─────── SECTION: One-Shot Speech ─────── */}
      <Section title="💬 One-Shot Speech">
        {/* Preset list */}
        <div className="space-y-2 mb-3">
          {speechPresets.map((preset) => (
            <div key={preset.id} className="flex items-center gap-2">
              <input
                type="text"
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500"
                value={preset.text}
                onChange={(e) => updatePresetText(preset.id, e.target.value)}
                placeholder="Enter speech text..."
              />
              <button
                className="px-3 py-2 bg-blue-700 hover:bg-blue-600 rounded text-sm font-medium transition-colors"
                onClick={() => sendSpeak(preset.text)}
                disabled={!preset.text.trim()}
              >
                ▶ Speak
              </button>
              <button
                className="px-2 py-2 bg-red-800 hover:bg-red-700 rounded text-xs transition-colors"
                onClick={() => deletePreset(preset.id)}
                title="Delete preset"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Add new preset */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500"
            value={newPresetText}
            onChange={(e) => setNewPresetText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPreset()}
            placeholder="New preset text..."
          />
          <button
            className="px-3 py-2 bg-green-800 hover:bg-green-700 rounded text-sm font-medium transition-colors disabled:opacity-40"
            onClick={addPreset}
            disabled={!newPresetText.trim()}
          >
            + Add
          </button>
        </div>

        {/* Stop button */}
        <div className="mt-3">
          <button
            className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded text-sm font-bold transition-colors"
            onClick={stopSpeech}
          >
            ⏹ Stop Speech
          </button>
        </div>
      </Section>

      {/* ─────── SECTION: Pose Execution ─────── */}
      <Section title="🧘 Pose Execution">
        {poseList.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            No poses configured. Add poses via character settings.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {poseList.map((pose) => (
              <button
                key={pose.id}
                className="px-3 py-2 bg-indigo-800 hover:bg-indigo-700 rounded text-sm font-medium transition-colors"
                onClick={() => applyPose(pose.id)}
              >
                {pose.id}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2">
          <button
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
            onClick={() => sendCommand('pose', { poseId: '__reset__' })}
          >
            🔄 Reset to Idle
          </button>
        </div>
      </Section>

      {/* ─────── SECTION: Settings Controls ─────── */}
      <Section title="⚙️ Settings Controls">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Toggle switches */}
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
            label="3DGS Background"
            enabled={gaussianSplatEnabled}
            onChange={(v) => toggleSetting('gaussianSplatEnabled', v)}
          />
          <SettingToggle
            label="Preset Questions"
            enabled={showPresetQuestions}
            onChange={(v) => toggleSetting('showPresetQuestions', v)}
          />
          <SettingToggle
            label="Message Receiver"
            enabled={messageReceiverEnabled}
            onChange={(v) => toggleSetting('messageReceiverEnabled', v)}
          />
          <SettingToggle
            label="Video as Background"
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

          {/* Select menus */}
          <SettingSelect
            label="Assistant Text Style"
            value={assistantTextStyle}
            options={[
              { value: 'bubble', label: 'Bubble (Glass)' },
              { value: 'borderless', label: 'Borderless' },
            ]}
            onChange={(v) => toggleSetting('assistantTextStyle', v)}
          />
          <SettingSelect
            label="Chat Log Style"
            value={chatLogStyle}
            options={[
              { value: 'glass', label: 'Glass' },
              { value: 'classic', label: 'Classic' },
            ]}
            onChange={(v) => toggleSetting('chatLogStyle', v)}
          />
          <SettingSelect
            label="Chat Log Position"
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
            label="Background Switch"
            value={backgroundSwitchMode}
            options={[
              { value: 'manual', label: 'Manual' },
              { value: 'timer', label: 'Timer' },
            ]}
            onChange={(v) => toggleSetting('backgroundSwitchMode', v)}
          />
        </div>

        {/* Conversation History Reset */}
        <div className="mt-4 pt-4 border-t border-gray-700">
          <button
            className="px-4 py-2 bg-red-800 hover:bg-red-700 rounded text-sm font-bold transition-colors"
            onClick={resetChat}
          >
            🗑 Reset Conversation History
          </button>
        </div>
      </Section>

      {/* ─────── SECTION: 3DGS Controls ─────── */}
      <Section title="🎯 3DGS Controls">
        {/* Splat file selector */}
        {splatFiles.length > 0 && (
          <div className="flex items-center gap-2 mb-3">
            <select
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white"
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
              className="px-2 py-2 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
              onClick={splatUnload}
            >
              Clear
            </button>
          </div>
        )}

        {/* HDRI file selector */}
        {hdriFiles.length > 0 && (
          <div className="flex items-center gap-2 mb-3">
            <select
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white"
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
              className="px-2 py-2 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
              onClick={hdriUnload}
            >
              Clear
            </button>
          </div>
        )}

        {/* Movement controls */}
        <div className="mb-3">
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">
            Movement
          </div>
          <div className="grid grid-cols-3 gap-1 max-w-[200px]">
            {/* Row 1: Y+ up (col 2) */}
            <div className="col-start-2">
              <SplatBtn icon="↑" onClick={() => splatMove(0, 1, 0)} />
            </div>
            {/* Row 2: X- left, fit, X+ right */}
            <div className="col-start-1">
              <SplatBtn icon="←" onClick={() => splatMove(-1, 0, 0)} />
            </div>
            <div className="col-start-2 flex items-center justify-center">
              <SplatBtn icon="◉" onClick={splatFit} label="Fit" />
            </div>
            <div className="col-start-3">
              <SplatBtn icon="→" onClick={() => splatMove(1, 0, 0)} />
            </div>
            {/* Row 3: Y- down */}
            <div className="col-start-2">
              <SplatBtn icon="↓" onClick={() => splatMove(0, -1, 0)} />
            </div>
            {/* Row 4: Z-axis */}
            <div className="col-start-1">
              <SplatBtn
                icon="↕"
                onClick={() => splatMove(0, 0, -1)}
                label="Back"
              />
            </div>
            <div className="col-start-3">
              <SplatBtn
                icon="↕"
                onClick={() => splatMove(0, 0, 1)}
                label="Forward"
              />
            </div>
          </div>
        </div>

        {/* Zoom */}
        <div className="mb-3">
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">
            Zoom
          </div>
          <div className="flex gap-2">
            <SplatBtn icon="−" onClick={() => splatZoom(0.9)} label="Out" />
            <SplatBtn icon="+" onClick={() => splatZoom(1.1)} label="In" />
          </div>
        </div>

        {/* Rotation */}
        <div className="mb-3">
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">
            Rotation
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-4">R</span>
              <SplatBtn icon="⟳" onClick={() => splatRotate(0.05, 0, 0)} />
              <SplatBtn icon="⟲" onClick={() => splatRotate(-0.05, 0, 0)} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-4">P</span>
              <SplatBtn icon="↑" onClick={() => splatRotate(0, 0.05, 0)} />
              <SplatBtn icon="↓" onClick={() => splatRotate(0, -0.05, 0)} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-4">Y</span>
              <SplatBtn icon="↺" onClick={() => splatRotate(0, 0, -0.05)} />
              <SplatBtn icon="↻" onClick={() => splatRotate(0, 0, 0.05)} />
            </div>
          </div>
        </div>

        {/* Preset rotation */}
        <div className="mb-3">
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">
            Preset Rotation
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="px-3 py-1.5 bg-amber-800 hover:bg-amber-700 rounded text-xs font-medium transition-colors"
              onClick={() => splatRotate(-Math.PI / 2, 0, 0)}
            >
              90° L
            </button>
            <button
              className="px-3 py-1.5 bg-amber-800 hover:bg-amber-700 rounded text-xs font-medium transition-colors"
              onClick={() => splatRotate(Math.PI / 2, 0, 0)}
            >
              90° R
            </button>
            <button
              className="px-3 py-1.5 bg-amber-800 hover:bg-amber-700 rounded text-xs font-medium transition-colors"
              onClick={() => splatRotate(Math.PI, 0, 0)}
            >
              180°
            </button>
            <button
              className="px-3 py-1.5 bg-amber-800 hover:bg-amber-700 rounded text-xs font-medium transition-colors"
              onClick={() => splatRotate(0, -Math.PI / 2, 0)}
            >
              90° ↓
            </button>
            <button
              className="px-3 py-1.5 bg-amber-800 hover:bg-amber-700 rounded text-xs font-medium transition-colors"
              onClick={() => splatRotate(0, Math.PI / 2, 0)}
            >
              90° ↑
            </button>
            <button
              className="px-3 py-1.5 bg-amber-800 hover:bg-amber-700 rounded text-xs font-medium transition-colors"
              onClick={() => splatRotate(0, 0, -Math.PI / 2)}
            >
              Y 90° L
            </button>
            <button
              className="px-3 py-1.5 bg-amber-800 hover:bg-amber-700 rounded text-xs font-medium transition-colors"
              onClick={() => splatRotate(0, 0, Math.PI / 2)}
            >
              Y 90° R
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            className="flex-1 px-3 py-2 bg-blue-800 hover:bg-blue-700 rounded text-xs font-medium transition-colors"
            onClick={splatFit}
          >
            画面内に収める
          </button>
          <button
            className="flex-1 px-3 py-2 bg-green-800 hover:bg-green-700 rounded text-xs font-medium transition-colors"
            onClick={splatReset}
          >
            初期位置にリセット
          </button>
        </div>

        {/* HDRI Rotation slider */}
        <div className="mt-3">
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">
            HDRI Rotation
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              className="flex-1 accent-cyan-400 bg-gray-700 rounded appearance-none cursor-pointer"
              min={-180}
              max={180}
              step={1}
              defaultValue={0}
              onChange={(e) => splatHdriRotate(parseInt(e.target.value, 10))}
            />
            <span className="text-xs text-cyan-300 w-10 text-right font-mono">
              0°
            </span>
          </div>
        </div>
      </Section>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-gray-700 text-center text-xs text-gray-500">
        EJ Controller v1.0 · Remote control for AITuberKit
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
    <div className="mb-6 p-4 bg-gray-900 rounded-xl border border-gray-800">
      <h2 className="text-lg font-bold mb-3">{title}</h2>
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
    <div className="flex items-center justify-between px-3 py-2 bg-gray-800 rounded-lg">
      <span className="text-sm text-gray-300">{label}</span>
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
    <div className="px-3 py-2 bg-gray-800 rounded-lg">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <select
        className="w-full bg-transparent border border-gray-700 rounded px-2 py-1 text-sm text-white"
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
      className="w-10 h-10 rounded bg-gray-700 hover:bg-gray-600 active:bg-gray-500
                 flex items-center justify-center text-white text-base
                 transition-colors select-none"
      onClick={onClick}
      title={label}
      aria-label={label || icon}
    >
      {icon}
    </button>
  )
}
