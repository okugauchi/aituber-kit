import React, { useCallback, useMemo, useState } from 'react'
import { useDraggable } from '@/hooks/useDraggable'
import { useResizable } from '@/hooks/useResizable'
import useImagesStore, {
  PlacedImage as PlacedImageType,
} from '@/features/stores/images'
import { debounce } from '@/utils/debounce'
import { IMAGE_CONSTANTS } from '@/constants/images'

interface PlacedImageProps {
  image: PlacedImageType
  onPositionChange?: (id: string, position: { x: number; y: number }) => void
  onSizeChange?: (id: string, size: { width: number; height: number }) => void
}

const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const

const FILTER_PRESETS = [
  { label: 'None', value: 'none' },
  { label: 'Blur', value: 'blur(2px)' },
  { label: 'Grayscale', value: 'grayscale(100%)' },
  { label: 'Sepia', value: 'sepia(80%)' },
  { label: 'Brightness', value: 'brightness(1.5)' },
  { label: 'Contrast', value: 'contrast(1.5)' },
  { label: 'Blur+Gray', value: 'blur(1px) grayscale(50%)' },
] as const

const PlacedImage: React.FC<PlacedImageProps> = ({
  image,
  onPositionChange,
  onSizeChange,
}) => {
  const {
    updatePlacedImagePosition,
    updatePlacedImageSize,
    updatePlacedImageOpacity,
    updatePlacedImageRotation,
    updatePlacedImageBlendMode,
    updatePlacedImageFilter,
  } = useImagesStore()
  const [showControls, setShowControls] = useState(false)

  // Debounced update functions
  const debouncedPositionUpdate = useMemo(
    () =>
      debounce((position: { x: number; y: number }) => {
        updatePlacedImagePosition(image.id, position)
        onPositionChange?.(image.id, position)
      }, IMAGE_CONSTANTS.DEBOUNCE_DELAY),
    [image.id, updatePlacedImagePosition, onPositionChange]
  )

  const debouncedSizeUpdate = useMemo(
    () =>
      debounce((size: { width: number; height: number }) => {
        updatePlacedImageSize(image.id, size)
        onSizeChange?.(image.id, size)
      }, IMAGE_CONSTANTS.DEBOUNCE_DELAY),
    [image.id, updatePlacedImageSize, onSizeChange]
  )

  const handlePositionChange = useCallback(
    (position: { x: number; y: number }) => {
      debouncedPositionUpdate(position)
    },
    [debouncedPositionUpdate]
  )

  const handleSizeChange = useCallback(
    (size: { width: number; height: number }) => {
      debouncedSizeUpdate(size)
    },
    [debouncedSizeUpdate]
  )

  const {
    position,
    isDragging,
    handleMouseDown,
    style: dragStyle,
  } = useDraggable(image.position)

  const { size, isResizing, handleResizeStart } = useResizable({
    initialWidth: image.size.width,
    initialHeight: image.size.height,
    minWidth: IMAGE_CONSTANTS.DIMENSIONS.MIN_WIDTH,
    minHeight: IMAGE_CONSTANTS.DIMENSIONS.MIN_HEIGHT,
    maxWidth: IMAGE_CONSTANTS.DIMENSIONS.MAX_WIDTH,
    maxHeight: IMAGE_CONSTANTS.DIMENSIONS.MAX_HEIGHT,
    aspectRatio: false,
  })

  // Update position when dragging stops
  React.useEffect(() => {
    if (
      !isDragging &&
      (position.x !== image.position.x || position.y !== image.position.y)
    ) {
      handlePositionChange(position)
    }
  }, [isDragging, position, image.position, handlePositionChange])

  // Update size when resizing stops
  React.useEffect(() => {
    if (
      !isResizing &&
      (size.width !== image.size.width || size.height !== image.size.height)
    ) {
      handleSizeChange(size)
    }
  }, [isResizing, size, image.size, handleSizeChange])

  // Build CSS filter value
  const cssFilter = image.filter === 'none' ? 'none' : image.filter
  const cssBlendMode =
    image.blendMode === 'normal' ? 'normal' : image.blendMode

  return (
    <div
      className="absolute select-none group"
      style={{
        ...dragStyle,
        width: size.width,
        height: size.height,
        zIndex: image.zIndex,
        transform: `translate(${position.x}px, ${position.y}px)`,
      }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* Image */}
      <img
        src={image.path}
        alt={image.filename}
        className="w-full h-full object-contain"
        draggable={false}
        onMouseDown={handleMouseDown}
        style={{
          opacity: image.opacity,
          filter: cssFilter,
          mixBlendMode: cssBlendMode,
        }}
      />

      {/* Property controls */}
      {showControls && !isDragging && !isResizing && (
        <div
          className="absolute -top-32 left-0 right-0 bg-gray-900/80 backdrop-blur rounded-lg p-2 space-y-1 z-50 pointer-events-auto"
          style={{ width: 'max-content', minWidth: '160px' }}
          onMouseEnter={() => setShowControls(true)}
          onMouseLeave={() => setShowControls(false)}
        >
          {/* Opacity slider */}
          <div className="flex items-center gap-2 text-xs text-white">
            <label className="w-12 shrink-0">Opacity</label>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(image.opacity * 100)}
              className="flex-1 h-1 accent-blue-500"
              onChange={(e) => {
                const val = Number(e.target.value) / 100
                updatePlacedImageOpacity(image.id, val)
              }}
            />
            <span className="w-8 text-right">{Math.round(image.opacity * 100)}%</span>
          </div>

          {/* Rotation slider */}
          <div className="flex items-center gap-2 text-xs text-white">
            <label className="w-12 shrink-0">Rotate</label>
            <input
              type="range"
              min="0"
              max="360"
              value={image.rotation}
              className="flex-1 h-1 accent-green-500"
              onChange={(e) => {
                updatePlacedImageRotation(image.id, Number(e.target.value))
              }}
            />
            <span className="w-8 text-right">{image.rotation}°</span>
          </div>

          {/* Blend mode dropdown */}
          <div className="flex items-center gap-2 text-xs text-white">
            <label className="w-12 shrink-0">Blend</label>
            <select
              value={image.blendMode}
              className="flex-1 bg-transparent border border-white/30 rounded px-1 py-0.5 text-white text-xs"
              onChange={(e) => {
                updatePlacedImageBlendMode(image.id, e.target.value)
              }}
            >
              {BLEND_MODES.map((mode) => (
                <option key={mode} value={mode} className="bg-gray-800 text-white">
                  {mode}
                </option>
              ))}
            </select>
          </div>

          {/* Filter preset dropdown */}
          <div className="flex items-center gap-2 text-xs text-white">
            <label className="w-12 shrink-0">Filter</label>
            <select
              value={image.filter}
              className="flex-1 bg-transparent border border-white/30 rounded px-1 py-0.5 text-white text-xs"
              onChange={(e) => {
                updatePlacedImageFilter(image.id, e.target.value)
              }}
            >
              {FILTER_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value} className="bg-gray-800 text-white">
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Resize handles */}
      {!isDragging && (
        <>
          {/* Corner handles */}
          <div
            className="absolute -top-2 -left-2 w-4 h-4 bg-blue-500 border border-white rounded-full cursor-nwse-resize opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
            onMouseDown={(e) => handleResizeStart(e, 'top-left')}
          />
          <div
            className="absolute -top-2 -right-2 w-4 h-4 bg-blue-500 border border-white rounded-full cursor-nesw-resize opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
            onMouseDown={(e) => handleResizeStart(e, 'top-right')}
          />
          <div
            className="absolute -bottom-2 -left-2 w-4 h-4 bg-blue-500 border border-white rounded-full cursor-nesw-resize opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
            onMouseDown={(e) => handleResizeStart(e, 'bottom-left')}
          />
          <div
            className="absolute -bottom-2 -right-2 w-4 h-4 bg-blue-500 border border-white rounded-full cursor-nwse-resize opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
            onMouseDown={(e) => handleResizeStart(e, 'bottom-right')}
          />

          {/* Edge handles */}
          <div
            className="absolute -top-2 left-1/2 w-4 h-4 bg-blue-500 border border-white rounded-full cursor-ns-resize opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity transform -translate-x-1/2"
            onMouseDown={(e) => handleResizeStart(e, 'top')}
          />
          <div
            className="absolute -bottom-2 left-1/2 w-4 h-4 bg-blue-500 border border-white rounded-full cursor-ns-resize opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity transform -translate-x-1/2"
            onMouseDown={(e) => handleResizeStart(e, 'bottom')}
          />
          <div
            className="absolute -left-2 top-1/2 w-4 h-4 bg-blue-500 border border-white rounded-full cursor-ew-resize opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity transform -translate-y-1/2"
            onMouseDown={(e) => handleResizeStart(e, 'left')}
          />
          <div
            className="absolute -right-2 top-1/2 w-4 h-4 bg-blue-500 border border-white rounded-full cursor-ew-resize opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity transform -translate-y-1/2"
            onMouseDown={(e) => handleResizeStart(e, 'right')}
          />
        </>
      )}

      {/* Drag indicator */}
      {isDragging && (
        <div className="absolute inset-0 border-2 border-blue-500 border-dashed rounded-lg bg-blue-500 bg-opacity-10" />
      )}

      {/* Resize indicator */}
      {isResizing && (
        <div className="absolute inset-0 border-2 border-green-500 border-dashed rounded-lg bg-green-500 bg-opacity-10" />
      )}
    </div>
  )
}

export default PlacedImage
