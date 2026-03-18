import React, { useMemo, useState, useCallback } from 'react'
import { Booking, RoomUnit } from '@/types'
import { useVisibleRange } from '@/hooks/useVisibleRange'
import { RoomRow } from './RoomRow'
import { useAppContext } from "@/context/AppContext";

const COLUMN_WIDTH_PX = 48
const TOTAL_DAYS = 30

interface BookingGridProps {
  roomUnits: RoomUnit[]
  bookings: Booking[]
  onBookingClick: (booking: Booking) => void
}

function getDayLabels(startDate: string, totalDays: number): string[] {
  return Array.from({ length: totalDays }, (_, i) => {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    return `${d.getMonth() + 1}/${d.getDate()}`
  })
}

export function BookingGrid({ roomUnits, bookings, onBookingClick }: BookingGridProps) {
  const { visibleRange, handleScroll } = useVisibleRange()
  const { config } = useAppContext()

  // 在 BookingGrid 中管理 hover 状态，而不是通过 Context
  // 这样只有被 hover 的行会收到更新的 props
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null)

  const handleCellHover = useCallback((rowId: string | null, dayIndex: number | null) => {
    setHoveredRowId(rowId)
    setHoveredDayIndex(dayIndex)
  }, [])

  // 统一使用 context 中的日期基准，与 RoomRow 保持一致，避免错位
  const startDate = config.dateRangeStart

  // 日期标签只在 startDate 变化时重新计算，避免每次渲染都生成 30 个字符串
  const dayLabels = useMemo(() => getDayLabels(startDate, TOTAL_DAYS), [startDate])

  // 将全量 bookings 按 roomId 预先分组，避免每个房间单独 filter 遍历全量数据
  // 重要：为所有房间预先初始化空数组，确保没有预订的房间也能获得稳定的引用
  const bookingsByRoom = useMemo(() => {
    const map = new Map<string, Booking[]>()
    // 先为所有房间初始化空数组
    for (const room of roomUnits) {
      map.set(room.id, [])
    }
    // 再添加预订数据
    for (const b of bookings) {
      const list = map.get(b.roomUnit.roomId)
      if (list) {
        list.push(b)
      }
    }
    return map
  }, [bookings, roomUnits])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header row */}
      <div style={{ display: 'flex', borderBottom: '2px solid #ddd', background: '#fafafa' }}>
        <div style={{ width: 140, minWidth: 140, padding: '8px 12px', fontWeight: 600, fontSize: 13, borderRight: '1px solid #eee', background: config.bookingHeaderBackground }}>
          Room
        </div>
        <div
          style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            background: config.bookingHeaderBackground
          }}
        >
          {Array.from({ length: visibleRange.endIndex - visibleRange.startIndex + 1 }, (_, i) => {
            const dayIndex = visibleRange.startIndex + i
            if (dayIndex >= TOTAL_DAYS) return null
            return (
              <div
                key={dayIndex}
                style={{
                  width: COLUMN_WIDTH_PX,
                  minWidth: COLUMN_WIDTH_PX,
                  padding: '8px 4px',
                  fontSize: 11,
                  textAlign: 'center',
                  borderRight: '1px solid #eee',
                  color: '#666',
                }}
              >
                {dayLabels[dayIndex]}
              </div>
            )
          })}
        </div>
      </div>

      {/* Scrollable grid body */}
      <div
        style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}
        onScroll={handleScroll}
      >
        <div style={{ minWidth: TOTAL_DAYS * COLUMN_WIDTH_PX + 140 }}>
          {roomUnits.map(room => {
            const roomBookings = bookingsByRoom.get(room.id)!
            const isHovered = hoveredRowId === room.id
            // 只给被 hover 的行传递 hoveredDayIndex，其他行传 null
            // 这样 React.memo 的浅比较会发现其他行的 props 没有变化
            return (
              <RoomRow
                key={room.id}
                rowId={room.id}
                rowName={room.name}
                bookings={roomBookings}
                visibleStartIndex={visibleRange.startIndex}
                visibleEndIndex={visibleRange.endIndex}
                totalDays={TOTAL_DAYS}
                onBookingClick={onBookingClick}
                isHovered={isHovered}
                hoveredDayIndex={isHovered ? hoveredDayIndex : null}
                onCellHover={handleCellHover}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
