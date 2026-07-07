/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react'
import { useTheme } from '@/hooks/useTheme'
import settingsStore from '@/features/stores/settings'
import { applySettingsState } from '../helpers/settingsStoreMock'

// Mock settings store
jest.mock('@/features/stores/settings', () =>
  require('../helpers/settingsStoreMock').createMockSettingsStore()
)

// Helper function to setup mock settings
function setupSettingsMock(colorTheme = 'default') {
  applySettingsState(settingsStore, { colorTheme })
}

describe('useTheme', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupSettingsMock()
    document.documentElement.removeAttribute('data-theme')
  })

  it('ストアのcolorThemeを返す', () => {
    setupSettingsMock('cool')

    const { result } = renderHook(() => useTheme())

    expect(result.current.colorTheme).toBe('cool')
  })

  it('マウント時にdata-theme属性へ初期テーマを適用する', () => {
    setupSettingsMock('ocean')

    renderHook(() => useTheme())

    expect(document.documentElement.getAttribute('data-theme')).toBe('ocean')
  })

  it('setThemeでストアが更新されdata-theme属性も変わる', () => {
    const { result } = renderHook(() => useTheme())

    act(() => {
      result.current.setTheme('forest')
    })

    expect(settingsStore.setState).toHaveBeenCalledWith({
      colorTheme: 'forest',
    })
    expect(document.documentElement.getAttribute('data-theme')).toBe('forest')
  })

  it('ストアのcolorThemeが変わると再レンダリングでdata-theme属性が更新される', () => {
    setupSettingsMock('default')

    const { rerender } = renderHook(() => useTheme())
    expect(document.documentElement.getAttribute('data-theme')).toBe('default')

    setupSettingsMock('sunset')
    rerender()

    expect(document.documentElement.getAttribute('data-theme')).toBe('sunset')
  })
})
