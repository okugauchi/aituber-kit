/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react'
import { useDraggable } from '@/hooks/useDraggable'
import {
  createReactMouseEvent,
  dispatchMouseMove,
  dispatchMouseUp,
} from '../helpers/mouseEventTestUtils'

// matchMediaのモック（デフォルト: マウスポインタ環境）
const setupMatchMedia = (coarsePointer: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    value: jest.fn((query: string) => ({
      matches: query === '(pointer: coarse)' ? coarsePointer : false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
    writable: true,
    configurable: true,
  })
}

describe('useDraggable', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupMatchMedia(false)
  })

  describe('初期状態', () => {
    it('初期位置が未指定の場合は{x: 0, y: 0}になる', () => {
      const { result } = renderHook(() => useDraggable())

      expect(result.current.position).toEqual({ x: 0, y: 0 })
      expect(result.current.isDragging).toBe(false)
    })

    it('初期位置を指定できる', () => {
      const { result } = renderHook(() => useDraggable({ x: 10, y: 20 }))

      expect(result.current.position).toEqual({ x: 10, y: 20 })
    })

    it('styleにtransformとgrabカーソルが設定される', () => {
      const { result } = renderHook(() => useDraggable({ x: 5, y: 15 }))

      expect(result.current.style.transform).toBe('translate(5px, 15px)')
      expect(result.current.style.cursor).toBe('grab')
    })
  })

  describe('ドラッグ座標計算', () => {
    it('handleMouseDownでisDraggingがtrueになりカーソルがgrabbingになる', () => {
      const { result } = renderHook(() => useDraggable())

      act(() => {
        result.current.handleMouseDown(createReactMouseEvent(100, 100))
      })

      expect(result.current.isDragging).toBe(true)
      expect(result.current.style.cursor).toBe('grabbing')
    })

    it('mousemoveの移動量分だけpositionが更新される', () => {
      const { result } = renderHook(() => useDraggable())

      act(() => {
        result.current.handleMouseDown(createReactMouseEvent(100, 100))
      })

      act(() => {
        dispatchMouseMove(150, 130)
      })

      expect(result.current.position).toEqual({ x: 50, y: 30 })
    })

    it('初期位置を起点として移動量が加算される', () => {
      const { result } = renderHook(() => useDraggable({ x: 10, y: 20 }))

      act(() => {
        result.current.handleMouseDown(createReactMouseEvent(200, 200))
      })

      act(() => {
        dispatchMouseMove(250, 180)
      })

      expect(result.current.position).toEqual({ x: 60, y: 0 })
    })

    it('連続したmousemoveでもドラッグ開始位置基準で計算される', () => {
      const { result } = renderHook(() => useDraggable())

      act(() => {
        result.current.handleMouseDown(createReactMouseEvent(0, 0))
      })

      act(() => {
        dispatchMouseMove(10, 10)
      })
      act(() => {
        dispatchMouseMove(30, 5)
      })

      // 累積ではなくドラッグ開始位置(0,0)からの差分
      expect(result.current.position).toEqual({ x: 30, y: 5 })
    })

    it('mouseupでドラッグが終了しonPositionChangeが呼ばれる', () => {
      const onPositionChange = jest.fn()
      const { result } = renderHook(() =>
        useDraggable({ x: 0, y: 0 }, onPositionChange)
      )

      act(() => {
        result.current.handleMouseDown(createReactMouseEvent(100, 100))
      })

      act(() => {
        dispatchMouseMove(140, 120)
      })

      act(() => {
        dispatchMouseUp()
      })

      expect(result.current.isDragging).toBe(false)
      expect(onPositionChange).toHaveBeenCalledWith({ x: 40, y: 20 })
    })

    it('ドラッグ中はbodyのuserSelectがnoneになり終了後に解除される', () => {
      const { result } = renderHook(() => useDraggable())

      act(() => {
        result.current.handleMouseDown(createReactMouseEvent(0, 0))
      })

      expect(document.body.style.userSelect).toBe('none')

      act(() => {
        dispatchMouseUp()
      })

      expect(document.body.style.userSelect).toBe('')
    })

    it('ドラッグしていない状態のmousemoveではpositionが変化しない', () => {
      const { result } = renderHook(() => useDraggable())

      act(() => {
        dispatchMouseMove(500, 500)
      })

      expect(result.current.position).toEqual({ x: 0, y: 0 })
    })
  })

  describe('位置のリセットと手動設定', () => {
    it('resetPositionで初期位置に戻る', () => {
      const { result } = renderHook(() => useDraggable({ x: 10, y: 20 }))

      act(() => {
        result.current.handleMouseDown(createReactMouseEvent(0, 0))
      })
      act(() => {
        dispatchMouseMove(100, 100)
      })
      act(() => {
        dispatchMouseUp()
      })

      act(() => {
        result.current.resetPosition()
      })

      expect(result.current.position).toEqual({ x: 10, y: 20 })
    })

    it('setPositionで任意の位置を設定できる', () => {
      const { result } = renderHook(() => useDraggable())

      act(() => {
        result.current.setPosition({ x: 123, y: 456 })
      })

      expect(result.current.position).toEqual({ x: 123, y: 456 })
    })
  })

  describe('モバイル判定', () => {
    it('coarseポインタの場合isMobileがtrueになりドラッグが無効化される', () => {
      setupMatchMedia(true)

      const { result } = renderHook(() => useDraggable())

      expect(result.current.isMobile).toBe(true)
      expect(result.current.style.cursor).toBe('default')

      act(() => {
        result.current.handleMouseDown(createReactMouseEvent(100, 100))
      })

      expect(result.current.isDragging).toBe(false)
    })

    it('モバイル系userAgentの場合isMobileがtrueになる', () => {
      const originalUserAgent = navigator.userAgent
      Object.defineProperty(navigator, 'userAgent', {
        value:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        writable: true,
        configurable: true,
      })

      try {
        const { result } = renderHook(() => useDraggable())
        expect(result.current.isMobile).toBe(true)
      } finally {
        Object.defineProperty(navigator, 'userAgent', {
          value: originalUserAgent,
          writable: true,
          configurable: true,
        })
      }
    })

    it('デスクトップ環境ではisMobileがfalseになる', () => {
      const { result } = renderHook(() => useDraggable())

      expect(result.current.isMobile).toBe(false)
    })
  })
})
