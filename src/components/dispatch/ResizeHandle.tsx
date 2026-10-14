'use client'

import { useRef } from 'react'

/**
 * Lightweight, dependency-free drag handle used to resize adjacent panels.
 *
 * - `orientation="vertical"`   → a vertical bar you drag left/right (resizes widths)
 * - `orientation="horizontal"` → a horizontal bar you drag up/down (resizes heights)
 *
 * The handle only reports the cumulative pixel delta since the drag started;
 * the parent decides how to translate that into a size (and clamps it).
 */
interface ResizeHandleProps {
  orientation: 'vertical' | 'horizontal'
  onResizeStart: () => void
  onResize: (deltaPx: number) => void
  onResizeEnd: () => void
  onReset?: () => void
  label: string
}

const KEYBOARD_STEP_PX = 24

export default function ResizeHandle({ orientation, onResizeStart, onResize, onResizeEnd, onReset, label }: ResizeHandleProps) {
  const startRef = useRef(0)
  const lastDeltaRef = useRef(0)
  const frameRef = useRef(0)
  const draggingRef = useRef(false)

  const isVertical = orientation === 'vertical'

  const endDrag = (target: HTMLElement, pointerId: number) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    cancelAnimationFrame(frameRef.current)
    // Flush the final position synchronously so nothing is lost
    onResize(lastDeltaRef.current)
    onResizeEnd()
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      tabIndex={0}
      title={`${label} — drag to resize${onReset ? ', double-click to reset' : ''}`}
      className={`group shrink-0 flex items-center justify-center touch-none select-none outline-none ${
        isVertical ? 'w-4 cursor-col-resize' : 'h-4 cursor-row-resize'
      }`}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        draggingRef.current = true
        startRef.current = isVertical ? e.clientX : e.clientY
        lastDeltaRef.current = 0
        document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize'
        document.body.style.userSelect = 'none'
        onResizeStart()
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current) return
        lastDeltaRef.current = (isVertical ? e.clientX : e.clientY) - startRef.current
        cancelAnimationFrame(frameRef.current)
        frameRef.current = requestAnimationFrame(() => onResize(lastDeltaRef.current))
      }}
      onPointerUp={(e) => endDrag(e.currentTarget, e.pointerId)}
      onPointerCancel={(e) => endDrag(e.currentTarget, e.pointerId)}
      onDoubleClick={() => onReset?.()}
      onKeyDown={(e) => {
        const back = isVertical ? 'ArrowLeft' : 'ArrowUp'
        const forward = isVertical ? 'ArrowRight' : 'ArrowDown'
        if (e.key !== back && e.key !== forward) return
        e.preventDefault()
        onResizeStart()
        onResize(e.key === forward ? KEYBOARD_STEP_PX : -KEYBOARD_STEP_PX)
        onResizeEnd()
      }}
    >
      <div
        className={`rounded-full bg-gray-300 dark:bg-gray-700 transition-colors group-hover:bg-blue-500 group-focus-visible:bg-blue-500 group-active:bg-blue-600 ${
          isVertical ? 'w-1 h-12' : 'h-1 w-12'
        }`}
      />
    </div>
  )
}
