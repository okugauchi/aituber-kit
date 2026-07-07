import type React from 'react'

/**
 * マウス操作系フック（useDraggable / useResizable等）のテスト用共有ユーティリティ。
 */

// React.MouseEvent互換のモックイベントを生成
export const createReactMouseEvent = (clientX: number, clientY: number) =>
  ({
    clientX,
    clientY,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  }) as unknown as React.MouseEvent

// documentへのグローバルmousemove/mouseupイベントをディスパッチ
export const dispatchMouseMove = (clientX: number, clientY: number) => {
  document.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY }))
}

export const dispatchMouseUp = () => {
  document.dispatchEvent(new MouseEvent('mouseup'))
}
