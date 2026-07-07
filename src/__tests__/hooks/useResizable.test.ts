/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react'
import { useResizable } from '@/hooks/useResizable'
import {
  createReactMouseEvent,
  dispatchMouseMove,
  dispatchMouseUp,
} from '../helpers/mouseEventTestUtils'

// リサイズを開始してマウス移動する共通ヘルパー
const startResizeAndMove = (
  result: { current: ReturnType<typeof useResizable> },
  direction: string,
  from: { x: number; y: number },
  to: { x: number; y: number }
) => {
  act(() => {
    result.current.handleResizeStart(
      createReactMouseEvent(from.x, from.y),
      direction
    )
  })
  act(() => {
    dispatchMouseMove(to.x, to.y)
  })
}

describe('useResizable', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    document.body.style.cursor = 'auto'
  })

  describe('初期状態', () => {
    it('デフォルトの初期サイズは512x384になる', () => {
      const { result } = renderHook(() => useResizable())

      expect(result.current.size).toEqual({ width: 512, height: 384 })
      expect(result.current.isResizing).toBe(false)
    })

    it('初期サイズを指定できる', () => {
      const { result } = renderHook(() =>
        useResizable({ initialWidth: 400, initialHeight: 300 })
      )

      expect(result.current.size).toEqual({ width: 400, height: 300 })
    })
  })

  describe('リサイズ差分計算（アスペクト比あり）', () => {
    it('right方向へのドラッグで幅が増え、高さがアスペクト比に追従する', () => {
      const { result } = renderHook(() =>
        useResizable({ initialWidth: 400, initialHeight: 300 })
      )

      startResizeAndMove(result, 'right', { x: 0, y: 0 }, { x: 100, y: 0 })

      // 400 + 100 = 500, 高さは4:3を維持して375
      expect(result.current.size).toEqual({ width: 500, height: 375 })
    })

    it('left方向へのドラッグで幅が減る', () => {
      const { result } = renderHook(() =>
        useResizable({ initialWidth: 400, initialHeight: 300 })
      )

      startResizeAndMove(result, 'left', { x: 0, y: 0 }, { x: 100, y: 0 })

      // 400 - 100 = 300, 高さは4:3を維持して225
      expect(result.current.size).toEqual({ width: 300, height: 225 })
    })

    it('bottom方向へのドラッグで高さ基準にリサイズされる', () => {
      const { result } = renderHook(() =>
        useResizable({ initialWidth: 400, initialHeight: 300 })
      )

      startResizeAndMove(result, 'bottom', { x: 0, y: 0 }, { x: 0, y: 60 })

      // 300 + 60 = 360, 幅は4:3を維持して480
      expect(result.current.size).toEqual({ width: 480, height: 360 })
    })

    it('top方向への下ドラッグで高さが減る', () => {
      const { result } = renderHook(() =>
        useResizable({ initialWidth: 400, initialHeight: 300 })
      )

      startResizeAndMove(result, 'top', { x: 0, y: 0 }, { x: 0, y: 60 })

      // 300 - 60 = 240, 幅は4:3を維持して320
      expect(result.current.size).toEqual({ width: 320, height: 240 })
    })

    it('コーナー（bottom-right）ドラッグでは幅基準でリサイズされる', () => {
      const { result } = renderHook(() =>
        useResizable({ initialWidth: 400, initialHeight: 300 })
      )

      startResizeAndMove(
        result,
        'bottom-right',
        { x: 0, y: 0 },
        { x: 200, y: 999 }
      )

      // preferHeightではないので幅基準: 400 + 200 = 600, 高さ450
      expect(result.current.size).toEqual({ width: 600, height: 450 })
    })

    it('maxWidthを超える場合はアスペクト比を維持したままクランプされる', () => {
      const { result } = renderHook(() =>
        useResizable({
          initialWidth: 400,
          initialHeight: 300,
          maxWidth: 600,
          maxHeight: 1080,
        })
      )

      startResizeAndMove(result, 'right', { x: 0, y: 0 }, { x: 500, y: 0 })

      expect(result.current.size).toEqual({ width: 600, height: 450 })
    })

    it('minWidthを下回る場合はアスペクト比を維持したままクランプされる', () => {
      const { result } = renderHook(() =>
        useResizable({
          initialWidth: 400,
          initialHeight: 300,
          minWidth: 200,
          minHeight: 150,
        })
      )

      startResizeAndMove(result, 'left', { x: 0, y: 0 }, { x: 350, y: 0 })

      expect(result.current.size).toEqual({ width: 200, height: 150 })
    })
  })

  describe('リサイズ差分計算（アスペクト比なし）', () => {
    it('幅と高さが独立して変化する', () => {
      const { result } = renderHook(() =>
        useResizable({
          initialWidth: 400,
          initialHeight: 300,
          aspectRatio: false,
        })
      )

      startResizeAndMove(
        result,
        'bottom-right',
        { x: 0, y: 0 },
        { x: 50, y: 120 }
      )

      expect(result.current.size).toEqual({ width: 450, height: 420 })
    })

    it('min/maxの範囲でクランプされる', () => {
      const { result } = renderHook(() =>
        useResizable({
          initialWidth: 400,
          initialHeight: 300,
          aspectRatio: false,
          minWidth: 200,
          minHeight: 150,
          maxWidth: 600,
          maxHeight: 500,
        })
      )

      startResizeAndMove(
        result,
        'bottom-right',
        { x: 0, y: 0 },
        { x: 1000, y: 1000 }
      )

      expect(result.current.size).toEqual({ width: 600, height: 500 })

      startResizeAndMove(
        result,
        'bottom-right',
        { x: 0, y: 0 },
        { x: -1000, y: -1000 }
      )

      expect(result.current.size).toEqual({ width: 200, height: 150 })
    })
  })

  describe('コールバックと状態管理', () => {
    it('handleResizeStartでisResizingがtrueになりbodyカーソルが変わる', () => {
      const { result } = renderHook(() => useResizable())

      act(() => {
        result.current.handleResizeStart(createReactMouseEvent(0, 0), 'right')
      })

      expect(result.current.isResizing).toBe(true)
      expect(document.body.style.cursor).toBe('ew-resize')
    })

    it('コーナー方向ではnwse/neswカーソルが設定される', () => {
      const { result } = renderHook(() => useResizable())

      act(() => {
        result.current.handleResizeStart(
          createReactMouseEvent(0, 0),
          'bottom-right'
        )
      })

      expect(document.body.style.cursor).toBe('nwse-resize')
    })

    it('onResizeにdirection・startSize・deltaSizeが渡される', () => {
      const onResize = jest.fn()
      const { result } = renderHook(() =>
        useResizable({ initialWidth: 400, initialHeight: 300, onResize })
      )

      startResizeAndMove(result, 'right', { x: 0, y: 0 }, { x: 100, y: 0 })

      expect(onResize).toHaveBeenCalledWith({
        size: { width: 500, height: 375 },
        direction: 'right',
        startSize: { width: 400, height: 300 },
        deltaSize: { width: 100, height: 75 },
      })
    })

    it('mouseupでリサイズが終了しonSizeChangeが呼ばれる', () => {
      const onSizeChange = jest.fn()
      const { result } = renderHook(() =>
        useResizable({ initialWidth: 400, initialHeight: 300, onSizeChange })
      )

      startResizeAndMove(result, 'right', { x: 0, y: 0 }, { x: 100, y: 0 })

      act(() => {
        dispatchMouseUp()
      })

      expect(result.current.isResizing).toBe(false)
      expect(onSizeChange).toHaveBeenCalledWith({ width: 500, height: 375 })
      expect(document.body.style.cursor).toBe('auto')
    })

    it('リサイズ中でない場合mousemoveしてもサイズは変化しない', () => {
      const { result } = renderHook(() =>
        useResizable({ initialWidth: 400, initialHeight: 300 })
      )

      act(() => {
        dispatchMouseMove(500, 500)
      })

      expect(result.current.size).toEqual({ width: 400, height: 300 })
    })
  })

  describe('サイズのリセットと手動設定', () => {
    it('resetSizeで初期サイズに戻る', () => {
      const { result } = renderHook(() =>
        useResizable({ initialWidth: 400, initialHeight: 300 })
      )

      startResizeAndMove(result, 'right', { x: 0, y: 0 }, { x: 100, y: 0 })

      act(() => {
        result.current.resetSize()
      })

      expect(result.current.size).toEqual({ width: 400, height: 300 })
    })

    it('setSizeで任意のサイズを設定できる', () => {
      const { result } = renderHook(() => useResizable())

      act(() => {
        result.current.setSize({ width: 800, height: 600 })
      })

      expect(result.current.size).toEqual({ width: 800, height: 600 })
    })

    it('setSizeに同一サイズを渡した場合は同じ参照を維持する', () => {
      const { result } = renderHook(() =>
        useResizable({ initialWidth: 400, initialHeight: 300 })
      )
      const before = result.current.size

      act(() => {
        result.current.setSize({ width: 400, height: 300 })
      })

      expect(result.current.size).toBe(before)
    })
  })
})
