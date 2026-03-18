import { useState, useCallback } from 'react'

const COLUMN_WIDTH_PX = 48
const VISIBLE_COLUMNS = 14
const TOTAL_DAYS = 30

interface VisibleRange {
  startIndex: number
  endIndex: number
  offsetPx: number
}

export function useVisibleRange() {
  const [scrollLeft, setScrollLeft] = useState(0)

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft)
  }, [])

  const visibleRange: VisibleRange = {
    startIndex: Math.floor(scrollLeft / COLUMN_WIDTH_PX),
    endIndex: Math.min(Math.floor(scrollLeft / COLUMN_WIDTH_PX) + VISIBLE_COLUMNS, TOTAL_DAYS - 1),
    offsetPx: scrollLeft % COLUMN_WIDTH_PX,
  }

  return { visibleRange, handleScroll, scrollLeft }
}
