import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react'

interface HoveredCell {
  rowId: string
  dayIndex: number
}

interface HoverContextValue {
  hoveredCell: HoveredCell | null
  setHoveredCell: (cell: HoveredCell | null) => void
}

const HoverContext = createContext<HoverContextValue | null>(null)

export function HoverProvider({ children }: { children: ReactNode }) {
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null)

  const value: HoverContextValue = {
    hoveredCell,
    setHoveredCell,
  }

  return <HoverContext.Provider value={value}>{children}</HoverContext.Provider>
}

export function useHoverContext() {
  const ctx = useContext(HoverContext)
  if (!ctx) throw new Error('useHoverContext must be used within HoverProvider')
  return ctx
}
