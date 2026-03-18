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

  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null)

  const handleCellHover = useCallback((rowId: string | null, dayIndex: number | null) => {
    setHoveredRowId(rowId)
    setHoveredDayIndex(dayIndex)
  }, [])

  // 计算所有预订中最早的日期作为日期范围的起点
  const actualStartDate = useMemo(() => {
    if (bookings.length === 0) return config.dateRangeStart
    const earliestDate = bookings.reduce((earliest, booking) => {
      return booking.checkIn < earliest ? booking.checkIn : earliest
    }, bookings[0].checkIn)
    return earliestDate
  }, [bookings, config.dateRangeStart])

  const startDate = actualStartDate
  const dayLabels = useMemo(() => getDayLabels(startDate, TOTAL_DAYS), [startDate])

  const bookingsByRoom = useMemo(() => {
    const map = new Map<string, Booking[]>()
    for (const room of roomUnits) {
      map.set(room.id, [])
    }
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
      {/* Scrollable container - contains both header and body */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          position: 'relative'
        }}
        onScroll={handleScroll}
      >
        <div style={{ minWidth: TOTAL_DAYS * COLUMN_WIDTH_PX + 140 }}>
          {/* Header row */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              display: 'flex',
              borderBottom: '2px solid #ddd',
              background: '#fafafa',
              zIndex: 30,
            }}
          >
            {/* Room column header */}
            <div style={{
              position: 'sticky',
              left: 0,
              width: 140,
              minWidth: 140,
              padding: '8px 12px',
              fontWeight: 600,
              fontSize: 13,
              borderRight: '1px solid #eee',
              background: config.bookingHeaderBackground,
              zIndex: 40,
            }}>
              Room
            </div>

            {/* Date headers - use absolute positioning like RoomRow */}
            <div style={{ position: 'relative', flex: 1, height: 38, marginLeft: -140 }}>
              {Array.from({ length: TOTAL_DAYS }, (_, i) => {
                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      left: 140 + i * COLUMN_WIDTH_PX,  // 加上房间列宽度
                      width: COLUMN_WIDTH_PX,
                      height: 38,
                      padding: '8px 4px',
                      fontSize: 11,
                      textAlign: 'center',
                      borderRight: '1px solid #eee',
                      color: '#666',
                    }}
                  >
                    {dayLabels[i]}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Body rows */}
          {roomUnits.map(room => {
            const roomBookings = bookingsByRoom.get(room.id)!
            const isHovered = hoveredRowId === room.id
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
                dateRangeStart={startDate}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
