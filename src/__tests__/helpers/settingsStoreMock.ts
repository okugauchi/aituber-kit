/**
 * settingsStore（Zustand）のセレクタ対応モック用共有ユーティリティ。
 *
 * 使い方:
 *   jest.mock('@/features/stores/settings', () =>
 *     require('../helpers/settingsStoreMock').createMockSettingsStore()
 *   )
 *
 * 注意: モック実装はモジュールファクトリに埋め込まず、各テストのbeforeEachで
 * applySettingsState()により再設定する。jest.clearAllMocks()はmockImplementationを
 * リセットしないため、テスト内での実装上書きが後続テストへ漏れるのを防ぐ。
 */

export type MockSettingsStore = jest.Mock & {
  getState: jest.Mock
  setState: jest.Mock
}

// jest.mock のモジュールファクトリから呼び出すモックモジュールを生成
export function createMockSettingsStore() {
  const mockFn = jest.fn()
  return {
    __esModule: true,
    default: Object.assign(mockFn, {
      getState: jest.fn(),
      setState: jest.fn(),
    }),
  }
}

// モック済みsettingsStoreにセレクタ対応のstateを設定する
export function applySettingsState<T extends object>(store: unknown, state: T) {
  const mockStore = store as MockSettingsStore
  mockStore.mockImplementation((selector: (s: T) => unknown) =>
    selector ? selector(state) : state
  )
  mockStore.getState.mockReturnValue(state)
}
