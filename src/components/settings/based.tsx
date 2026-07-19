import { logger } from '@/lib/logger'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from 'i18next'
import Image from 'next/image'
import { Language } from '@/features/constants/settings'
import homeStore from '@/features/stores/home'
import menuStore from '@/features/stores/menu'
import settingsStore from '@/features/stores/settings'
import { TextButton } from '../textButton'
import { ToggleSwitch } from '../toggleSwitch'
import { IMAGE_CONSTANTS } from '@/constants/images'
import { useRestrictedMode } from '@/hooks/useRestrictedMode'
import { languageOptions } from '@/components/settings/languageOptions'
import { settingsControlClass } from '@/components/settings/formStyles'

const Based = () => {
  const { t } = useTranslation()
  const { isRestrictedMode } = useRestrictedMode()
  const selectLanguage = settingsStore((s) => s.selectLanguage)
  const showAssistantText = settingsStore((s) => s.showAssistantText)
  const assistantTextStyle = settingsStore((s) => s.assistantTextStyle)
  const chatLogPosition = settingsStore((s) => s.chatLogPosition)
  const chatLogStyle = settingsStore((s) => s.chatLogStyle)
  const showCharacterName = settingsStore((s) => s.showCharacterName)
  const showControlPanel = settingsStore((s) => s.showControlPanel)
  const useVideoAsBackground = settingsStore((s) => s.useVideoAsBackground)
  const changeEnglishToJapanese = settingsStore(
    (s) => s.changeEnglishToJapanese
  )
  const colorTheme = settingsStore((s) => s.colorTheme)
  const [backgroundFiles, setBackgroundFiles] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [splatFiles, setSplatFiles] = useState<
    { name: string; size: number; url: string }[] | null
  >(null)
  const [hdriFiles, setHdriFiles] = useState<
    { name: string; size: number; url: string }[] | null
  >(null)
  const backgroundImageUrl = homeStore((s) => s.backgroundImageUrl)
  const backgroundImageList = homeStore((s) => s.backgroundImageList)
  const currentBackgroundIndex = homeStore((s) => s.currentBackgroundIndex)
  const backgroundSwitchMode = homeStore((s) => s.backgroundSwitchMode)
  const backgroundSwitchInterval = homeStore((s) => s.backgroundSwitchInterval)
  const gaussianSplatEnabled = settingsStore((s) => s.gaussianSplatEnabled)
  const gaussianSplatUrl = homeStore((s) => s.gaussianSplatUrl)
  const gaussianSplatLoading = homeStore((s) => s.gaussianSplatLoading)
  const gaussianSplatProgress = homeStore((s) => s.gaussianSplatProgress)
  const gaussianSplatError = homeStore((s) => s.gaussianSplatError)
  const gaussianSplatOpacity = homeStore((s) => s.gaussianSplatOpacity)
  const gaussianSplatScale = homeStore((s) => s.gaussianSplatScale)
  const gaussianSplatHdriUrl = homeStore((s) => s.gaussianSplatHdriUrl)
  const gaussianSplatHdriLoading = homeStore((s) => s.gaussianSplatHdriLoading)
  const gaussianSplatHdriError = homeStore((s) => s.gaussianSplatHdriError)
  const gaussianSplatRotationOffset = homeStore(
    (s) => s.gaussianSplatRotationOffset
  )
  const gaussianSplatControlsVisible = homeStore(
    (s) => s.gaussianSplatControlsVisible
  )

  useEffect(() => {
    setIsLoading(true)
    setError(null)
    fetch('/api/get-background-list')
      .then((res) => res.json())
      .then((files) =>
        setBackgroundFiles(files.filter((file: string) => file !== 'bg-c.png'))
      )
      .catch((error) => {
        logger.error('Error fetching background list:', error)
        setError(t('BackgroundListFetchError'))
      })
      .finally(() => {
        setIsLoading(false)
      })

    // Fetch local splat files for the file picker
    fetch('/api/get-splat-list')
      .then((res) => res.json())
      .then((files: { name: string; size: number; url: string }[]) => {
        setSplatFiles(files)
      })
      .catch((error) => {
        logger.error('Error fetching splat list:', error)
        setSplatFiles([])
      })

    // Fetch local HDRI files for the dropdown
    fetch('/api/get-hdri-list')
      .then((res) => res.json())
      .then((files: { name: string; size: number; url: string }[]) => {
        setHdriFiles(files)
      })
      .catch((error) => {
        logger.error('Error fetching HDRI list:', error)
        setHdriFiles([])
      })
  }, [t])

  const handleBackgroundUpload = async (file: File) => {
    // ファイルタイプの検証
    if (!file.type.startsWith('image/')) {
      setUploadError(t('OnlyImageFilesAllowed'))
      return
    }

    // ファイルサイズの検証（例：5MB以下）
    if (file.size > IMAGE_CONSTANTS.COMPRESSION.LARGE_FILE_THRESHOLD) {
      setUploadError(t('FileSizeLimitExceeded'))
      return
    }

    setIsUploading(true)
    setUploadError(null)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/upload-background', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`${t('UploadFailed')}: ${response.status}`)
      }

      const { path } = await response.json()
      const state = homeStore.getState()
      const updatedList = state.backgroundImageList.includes(path)
        ? state.backgroundImageList
        : [...state.backgroundImageList, path]
      homeStore.setState({
        backgroundImageUrl: path,
        backgroundImageList: updatedList,
        currentBackgroundIndex: updatedList.indexOf(path),
      })

      // バックグラウンドリストを更新
      setIsLoading(true)
      setError(null)
      const listResponse = await fetch('/api/get-background-list')
      if (!listResponse.ok) {
        throw new Error(t('BackgroundListFetchError'))
      }
      const files = await listResponse.json()
      setBackgroundFiles(files.filter((file: string) => file !== 'bg-c.png'))
    } catch (error) {
      logger.error('Error uploading background:', error)
      setUploadError(t('BackgroundUploadError'))
    } finally {
      setIsUploading(false)
      setIsLoading(false)
    }
  }

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center mb-6">
          <div
            className="w-6 h-6 mr-2 icon-mask-default"
            style={{
              maskImage: 'url(/images/setting-icons/basic-settings.svg)',
              maskSize: 'contain',
              maskRepeat: 'no-repeat',
              maskPosition: 'center',
            }}
          />
          <h2 className="text-2xl font-bold">{t('BasedSettings')}</h2>
        </div>
        <div className="mb-4 text-xl font-bold">{t('Language')}</div>
        <div className="my-2">
          <select
            className={settingsControlClass.compact}
            value={selectLanguage}
            onChange={(e) => {
              const newLanguage = e.target.value as Language
              settingsStore.setState({ selectLanguage: newLanguage })
              i18n.changeLanguage(newLanguage)
            }}
          >
            {languageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {selectLanguage === 'ja' && (
        <div className="my-6">
          <div className="my-4 font-bold">{t('EnglishToJapanese')}</div>
          <div className="my-2">
            <ToggleSwitch
              enabled={changeEnglishToJapanese}
              onChange={(v) =>
                settingsStore.setState({ changeEnglishToJapanese: v })
              }
            />
          </div>
        </div>
      )}
      <div className="border-t border-gray-300 pt-6 my-6">
        <div className="my-4 text-xl font-bold">{t('UserDisplayName')}</div>
        <input
          className={settingsControlClass.compact}
          type="text"
          placeholder={t('UserDisplayName')}
          value={settingsStore((s) => s.userDisplayName)}
          onChange={(e) =>
            settingsStore.setState({ userDisplayName: e.target.value })
          }
        />
      </div>
      <div className="border-t border-gray-300 pt-6 my-6">
        <div className="my-4 text-xl font-bold">{t('BackgroundSettings')}</div>
        <div className="my-2 text-sm whitespace-pre-wrap">
          {t('BackgroundSettingsDescription')}
        </div>

        {isLoading && <div className="my-2">{t('Loading')}</div>}
        {error && <div className="my-2 text-red-500">{error}</div>}
        {uploadError && <div className="my-2 text-red-500">{uploadError}</div>}

        {/* Single background selector (original) */}
        <div className="flex flex-col mb-4">
          <select
            className={settingsControlClass.medium}
            value={backgroundImageUrl}
            onChange={(e) => {
              const path = e.target.value
              homeStore.setState({ backgroundImageUrl: path })
            }}
            disabled={isLoading || isUploading || isRestrictedMode}
          >
            <option value="/backgrounds/bg-c.png">
              {t('DefaultBackground')}
            </option>
            <option value="green">{t('GreenBackground')}</option>
            {backgroundFiles.map((file) => (
              <option key={file} value={`/backgrounds/${file}`}>
                {file}
              </option>
            ))}
          </select>
        </div>

        <div className="my-4">
          <TextButton
            onClick={() => {
              const { fileInput } = menuStore.getState()
              if (fileInput) {
                fileInput.accept = 'image/*'
                fileInput.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0]
                  if (file) {
                    handleBackgroundUpload(file)
                  }
                }
                fileInput.click()
              }
            }}
            disabled={isLoading || isUploading || isRestrictedMode}
          >
            {isUploading ? t('Uploading') : t('UploadBackground')}
          </TextButton>
        </div>

        {/* Multi-background management */}
        <div className="border-t border-gray-300 pt-4 my-4">
          <div className="my-2 text-lg font-bold">Multi-Background</div>

          {/* Background list */}
          <div className="my-2 space-y-1">
            {backgroundImageList.map((url, index) => (
              <div
                key={`bg-${index}`}
                className={`flex items-center gap-2 text-sm py-1 px-2 rounded ${
                  index === currentBackgroundIndex
                    ? 'bg-blue-500/20 border border-blue-500'
                    : 'bg-gray-800/20'
                }`}
              >
                <span className="flex-1 truncate">{url}</span>
                {index === currentBackgroundIndex && (
                  <span className="text-blue-300 text-xs">(active)</span>
                )}
                <button
                  className="text-red-400 hover:text-red-300 text-xs ml-2"
                  onClick={() => {
                    const newList = backgroundImageList.filter(
                      (_, i) => i !== index
                    )
                    if (newList.length === 0) {
                      newList.push('/backgrounds/bg-c.png')
                    }
                    homeStore.setState({
                      backgroundImageList: newList,
                      currentBackgroundIndex: Math.min(
                        currentBackgroundIndex,
                        newList.length - 1
                      ),
                      backgroundImageUrl:
                        newList[
                          Math.min(currentBackgroundIndex, newList.length - 1)
                        ] || newList[0],
                    })
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Add current background to list */}
          <div className="my-2">
            <TextButton
              onClick={() => {
                const alreadyInList =
                  backgroundImageList.includes(backgroundImageUrl)
                if (!alreadyInList) {
                  homeStore.setState({
                    backgroundImageList: [
                      ...backgroundImageList,
                      backgroundImageUrl,
                    ],
                  })
                }
              }}
              disabled={backgroundImageList.includes(backgroundImageUrl)}
            >
              Add current to list
            </TextButton>
          </div>

          {/* Switch mode */}
          <div className="my-2 flex items-center gap-2">
            <span className="text-sm">Switch mode:</span>
            <select
              className="text-xs bg-transparent border border-white/30 rounded px-2 py-1"
              value={backgroundSwitchMode}
              onChange={(e) =>
                homeStore.setState({
                  backgroundSwitchMode: e.target.value as 'manual' | 'timer',
                })
              }
            >
              <option value="manual">Manual</option>
              <option value="timer">Timer</option>
            </select>
          </div>

          {/* Timer interval */}
          {backgroundSwitchMode === 'timer' && (
            <div className="my-2 flex items-center gap-2">
              <span className="text-sm">Interval (s):</span>
              <input
                type="number"
                min="5"
                max="3600"
                className="w-16 bg-transparent border border-white/30 rounded px-2 py-1 text-sm"
                value={backgroundSwitchInterval}
                onChange={(e) =>
                  homeStore.setState({
                    backgroundSwitchInterval: Math.max(
                      5,
                      Number(e.target.value)
                    ),
                  })
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* 3D Gaussian Splatting background */}
      <div className="border-t border-gray-300 pt-4 my-4">
        <div className="my-2 text-lg font-bold">3DGS Background</div>
        <div className="my-2 text-sm whitespace-pre-wrap">
          Use photorealistic 3D scenes as background via Spark (3D Gaussian
          Splatting).
        </div>

        {/* Toggle */}
        <div className="my-2 flex items-center gap-2">
          <ToggleSwitch
            enabled={gaussianSplatEnabled}
            onChange={(v) => {
              settingsStore.setState({ gaussianSplatEnabled: v })
              homeStore.setState({ gaussianSplatEnabled: v })
              if (!v) {
                const viewer = homeStore.getState().viewer
                viewer?.unloadSplatScene()
              }
            }}
          />
          <span className="text-sm">Enable 3DGS Background</span>
        </div>

        {gaussianSplatEnabled && (
          <div className="my-2 space-y-2">
            {/* URL input + local file picker */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="URL to .spz/.splat/.sog file..."
                className="flex-1 bg-transparent border border-white/30 rounded px-2 py-1 text-sm"
                value={gaussianSplatUrl}
                onChange={(e) =>
                  homeStore.setState({ gaussianSplatUrl: e.target.value })
                }
                onBlur={() => {
                  const { viewer, gaussianSplatUrl: url } = homeStore.getState()
                  if (url) viewer?.loadSplatScene(url)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const { viewer, gaussianSplatUrl: url } =
                      homeStore.getState()
                    if (url) viewer?.loadSplatScene(url)
                  }
                }}
              />
              <button
                className="text-xs bg-primary hover:bg-primary-hover px-3 py-1 rounded transition-colors"
                onClick={() => {
                  if (gaussianSplatUrl) {
                    const viewer = homeStore.getState().viewer
                    viewer?.loadSplatScene(gaussianSplatUrl)
                  }
                }}
              >
                Load
              </button>
              <button
                className="text-xs bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded transition-colors"
                onClick={() => {
                  const viewer = homeStore.getState().viewer
                  viewer?.unloadSplatScene()
                  homeStore.setState({ gaussianSplatUrl: '' })
                }}
              >
                Clear
              </button>
            </div>

            {/* Local file picker */}
            {splatFiles && splatFiles.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  className="flex-1 bg-transparent border border-white/30 rounded px-2 py-1 text-sm text-white"
                  onChange={(e) => {
                    const url = e.target.value
                    if (url) {
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
              </div>
            )}

            {/* Progress bar */}
            {gaussianSplatLoading && (
              <div className="my-2">
                <div className="flex items-center gap-2 text-xs text-yellow-400 mb-1">
                  <span className="inline-block w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                  Loading 3DGS scene... {gaussianSplatProgress}%
                </div>
                <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-400 rounded-full transition-all duration-200"
                    style={{ width: `${gaussianSplatProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error display */}
            {gaussianSplatError && (
              <div className="text-xs text-red-400 bg-red-900/20 rounded px-2 py-1">
                Error: {gaussianSplatError}
                <button
                  className="ml-2 text-blue-400 hover:text-blue-300 underline"
                  onClick={() => {
                    const { viewer, gaussianSplatUrl: url } =
                      homeStore.getState()
                    if (url) viewer?.loadSplatScene(url)
                  }}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Opacity control */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-16">Opacity</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                className="flex-1"
                value={gaussianSplatOpacity}
                onChange={(e) => {
                  const val = parseFloat(e.target.value)
                  homeStore.setState({ gaussianSplatOpacity: val })
                  const viewer = homeStore.getState().viewer
                  viewer?.setSplatOpacity(val)
                }}
              />
              <span className="text-xs text-gray-400 w-10 text-right">
                {Math.round(gaussianSplatOpacity * 100)}%
              </span>
            </div>

            {/* Scale control (real-world capture scale) */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-16">Scale</span>
              <input
                type="range"
                min="0.01"
                max="5"
                step="0.05"
                className="flex-1"
                value={gaussianSplatScale}
                onChange={(e) => {
                  const val = parseFloat(e.target.value)
                  homeStore.setState({ gaussianSplatScale: val })
                  const viewer = homeStore.getState().viewer
                  viewer?.setSplatScale(val)
                }}
              />
              <span className="text-xs text-gray-400 w-10 text-right">
                {gaussianSplatScale.toFixed(2)}×
              </span>
            </div>

            <div className="text-xs text-gray-500">
              Supported formats: .spz, .ply, .splat, .ksplat, .sog
            </div>

            {/* HDRI / equirectangular background */}
            <div className="border-t border-white/10 pt-2">
              <div className="text-xs text-gray-400 mb-1">HDRI Background</div>
              <div className="flex items-center gap-2">
                <select
                  className="flex-1 bg-transparent border border-white/30 rounded px-2 py-1 text-sm text-white"
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
                  {hdriFiles &&
                    hdriFiles.map((f) => {
                      const sizeMB = (f.size / 1024 / 1024).toFixed(1)
                      return (
                        <option key={f.url} value={f.url}>
                          {f.name} ({sizeMB} MB)
                        </option>
                      )
                    })}
                </select>
                <button
                  className="text-xs bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded transition-colors"
                  onClick={() => {
                    const viewer = homeStore.getState().viewer
                    viewer?.unloadSplatHdri()
                    homeStore.setState({ gaussianSplatHdriUrl: '' })
                  }}
                >
                  Clear
                </button>
              </div>
              {gaussianSplatHdriLoading && (
                <div className="text-xs text-yellow-400 mt-1">
                  Loading HDRI...
                </div>
              )}
              {gaussianSplatHdriError && (
                <div className="text-xs text-red-400 mt-1">
                  Error: {gaussianSplatHdriError}
                </div>
              )}
              <div className="text-xs text-gray-500 mt-1">
                Supported: .hdr, .exr, .jpg, .png (equirectangular maps)
              </div>
            </div>

            {/* Rotation offset (axis correction) */}
            <div className="border-t border-white/10 pt-2">
              <div className="text-xs text-gray-400 mb-1">
                Rotation Offset (degrees)
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-6">R</span>
                <input
                  type="number"
                  className="w-16 bg-transparent border border-white/30 rounded px-1 py-1 text-xs text-center"
                  value={Math.round(
                    (gaussianSplatRotationOffset[0] * 180) / Math.PI
                  )}
                  onChange={(e) => {
                    const deg = parseFloat(e.target.value) || 0
                    const rad = (deg * Math.PI) / 180
                    const newOffset: [number, number, number] = [
                      rad,
                      gaussianSplatRotationOffset[1],
                      gaussianSplatRotationOffset[2],
                    ]
                    homeStore.setState({
                      gaussianSplatRotationOffset: newOffset,
                    })
                  }}
                />
                <span className="text-xs text-gray-500 w-6">P</span>
                <input
                  type="number"
                  className="w-16 bg-transparent border border-white/30 rounded px-1 py-1 text-xs text-center"
                  value={Math.round(
                    (gaussianSplatRotationOffset[1] * 180) / Math.PI
                  )}
                  onChange={(e) => {
                    const deg = parseFloat(e.target.value) || 0
                    const rad = (deg * Math.PI) / 180
                    const newOffset: [number, number, number] = [
                      gaussianSplatRotationOffset[0],
                      rad,
                      gaussianSplatRotationOffset[2],
                    ]
                    homeStore.setState({
                      gaussianSplatRotationOffset: newOffset,
                    })
                  }}
                />
                <span className="text-xs text-gray-500 w-6">Y</span>
                <input
                  type="number"
                  className="w-16 bg-transparent border border-white/30 rounded px-1 py-1 text-xs text-center"
                  value={Math.round(
                    (gaussianSplatRotationOffset[2] * 180) / Math.PI
                  )}
                  onChange={(e) => {
                    const deg = parseFloat(e.target.value) || 0
                    const rad = (deg * Math.PI) / 180
                    const newOffset: [number, number, number] = [
                      gaussianSplatRotationOffset[0],
                      gaussianSplatRotationOffset[1],
                      rad,
                    ]
                    homeStore.setState({
                      gaussianSplatRotationOffset: newOffset,
                    })
                  }}
                />
                <button
                  className="text-xs bg-blue-800/40 hover:bg-blue-700/60 px-2 py-1 rounded transition-colors"
                  onClick={() => {
                    const viewer = homeStore.getState().viewer
                    viewer?.loadSplatScene(
                      homeStore.getState().gaussianSplatUrl
                    )
                  }}
                >
                  Reload
                </button>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Set initial rotation to match scene axis. Reload the scene after
                changing.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* アシスタントテキスト表示設定 */}
      <div className="border-t border-gray-300 pt-6 my-6">
        <div className="my-4 text-xl font-bold">{t('ShowAssistantText')}</div>
        <div className="my-2">
          <ToggleSwitch
            enabled={showAssistantText}
            onChange={(v) => settingsStore.setState({ showAssistantText: v })}
          />
        </div>
      </div>

      {/* 回答欄スタイル設定 */}
      {showAssistantText && (
        <div className="my-6">
          <div className="my-4 text-xl font-bold">
            {t('AssistantTextStyle')}
          </div>
          <div className="my-2 text-sm whitespace-pre-wrap">
            {t('AssistantTextStyleInfo')}
          </div>
          <div className="flex flex-col mb-4">
            <select
              className={settingsControlClass.medium}
              value={assistantTextStyle}
              onChange={(e) =>
                settingsStore.setState({
                  assistantTextStyle: e.target.value as 'bubble' | 'borderless',
                })
              }
            >
              <option value="bubble">{t('AssistantTextStyleBubble')}</option>
              <option value="borderless">
                {t('AssistantTextStyleBorderless')}
              </option>
            </select>
          </div>
        </div>
      )}

      {/* 会話ログデザイン設定 */}
      <div className="my-6">
        <div className="my-4 text-xl font-bold">{t('ChatLogStyle')}</div>
        <div className="my-2 text-sm whitespace-pre-wrap">
          {t('ChatLogStyleInfo')}
        </div>
        <div className="flex flex-col mb-4">
          <select
            className={settingsControlClass.medium}
            value={chatLogStyle}
            onChange={(e) =>
              settingsStore.setState({
                chatLogStyle: e.target.value as 'glass' | 'classic',
              })
            }
          >
            <option value="glass">{t('ChatLogStyleGlass')}</option>
            <option value="classic">{t('ChatLogStyleClassic')}</option>
          </select>
        </div>
      </div>

      {/* 会話ログ表示位置設定 */}
      <div className="my-6">
        <div className="my-4 text-xl font-bold">{t('ChatLogPosition')}</div>
        <div className="my-2 text-sm whitespace-pre-wrap">
          {t('ChatLogPositionInfo')}
        </div>
        <div className="flex flex-col mb-4">
          <select
            className={settingsControlClass.compact}
            value={chatLogPosition}
            onChange={(e) =>
              settingsStore.setState({
                chatLogPosition: e.target.value as 'left' | 'right',
              })
            }
          >
            <option value="right">{t('ChatLogPositionRight')}</option>
            <option value="left">{t('ChatLogPositionLeft')}</option>
          </select>
        </div>
      </div>

      {/* キャラクター名表示設定 */}
      <div className="my-6">
        <div className="my-4 text-xl font-bold">{t('ShowCharacterName')}</div>
        <div className="my-2">
          <ToggleSwitch
            enabled={showCharacterName}
            onChange={(v) => settingsStore.setState({ showCharacterName: v })}
          />
        </div>
      </div>

      {/* コントロールパネル表示設定 */}
      <div className="border-t border-gray-300 pt-6 my-6">
        <div className="my-4 text-xl font-bold">{t('ShowControlPanel')}</div>
        <div className="my-2 text-sm whitespace-pre-wrap">
          {t('ShowControlPanelInfo')}
        </div>

        <div className="my-2">
          <ToggleSwitch
            enabled={showControlPanel}
            onChange={(v) => settingsStore.setState({ showControlPanel: v })}
          />
        </div>
      </div>

      {/* カラーテーマ設定 */}
      <div className="border-t border-gray-300 pt-6 my-6">
        <div className="my-4 text-xl font-bold">{t('ColorTheme')}</div>
        <div className="my-2 text-sm whitespace-pre-wrap">
          {t('ColorThemeInfo')}
        </div>

        <div className="flex flex-col mb-4">
          <select
            className={settingsControlClass.compact}
            value={colorTheme}
            onChange={(e) => {
              const theme = e.target.value as
                | 'default'
                | 'cool'
                | 'mono'
                | 'ocean'
                | 'forest'
                | 'sunset'
              settingsStore.setState({ colorTheme: theme })
              // テーマをhtmlタグに適用
              document.documentElement.setAttribute('data-theme', theme)
            }}
          >
            <option value="default">{t('ThemeDefault')}</option>
            <option value="mono">{t('ThemeMono')}</option>
            <option value="cool">{t('ThemeCool')}</option>
            <option value="ocean">{t('ThemeOcean')}</option>
            <option value="forest">{t('ThemeForest')}</option>
            <option value="sunset">{t('ThemeSunset')}</option>
          </select>
        </div>
      </div>

      {/* UIカスタマイズ設定 */}
      <div className="border-t border-gray-300 pt-6 my-6">
        <div className="flex items-center mb-6">
          <div
            className="w-6 h-6 mr-2 icon-mask-default"
            style={{
              maskImage: 'url(/images/setting-icons/basic-settings.svg)',
              maskSize: 'contain',
              maskRepeat: 'no-repeat',
              maskPosition: 'center',
            }}
          />
          <h2 className="text-2xl font-bold">{t('UiCustomization')}</h2>
        </div>
        <div className="my-2 text-sm whitespace-pre-wrap">
          {t('UiCustomizationDescription')}
        </div>

        {/* ドロップシャドウ */}
        <div className="my-4">
          <div className="my-4 text-xl font-bold">{t('UiDropShadow')}</div>
          <div className="my-2 text-sm whitespace-pre-wrap">
            {t('UiDropShadowDescription')}
          </div>
          <div className="my-2">
            <ToggleSwitch
              enabled={settingsStore((s) => s.uiDropShadowEnabled)}
              onChange={(v) => {
                settingsStore.setState({ uiDropShadowEnabled: v })
                document.documentElement.setAttribute(
                  'data-ui-shadow-mode',
                  String(v)
                )
              }}
            />
          </div>
        </div>

        {/* ダークモード */}
        <div className="my-4">
          <div className="my-4 text-xl font-bold">{t('UiDarkMode')}</div>
          <div className="my-2 text-sm whitespace-pre-wrap">
            {t('UiDarkModeDescription')}
          </div>
          <div className="my-2">
            <ToggleSwitch
              enabled={settingsStore((s) => s.uiDarkMode)}
              onChange={(v) => settingsStore.setState({ uiDarkMode: v })}
            />
          </div>
        </div>

        {/* ボトムペイン透過度 */}
        <div className="my-4">
          <div className="my-4 text-xl font-bold">{t('BottomPaneOpacity')}</div>
          <div className="my-2 text-sm whitespace-pre-wrap">
            {t('BottomPaneOpacityDescription')}
          </div>
          <div className="my-2">
            <input
              type="range"
              min="0"
              max="100"
              className="input-range"
              value={settingsStore((s) => s.bottomPaneOpacity)}
              onChange={(e) =>
                settingsStore.setState({
                  bottomPaneOpacity: Number(e.target.value),
                })
              }
            />
            <span className="ml-2">
              {settingsStore((s) => s.bottomPaneOpacity)}%
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
export default Based
