import React, { useMemo } from "react";
import { Booking, BookingStatus } from "@/types";
import { COLUMN_WIDTH_PX } from "@/lib/constants";

interface RoomRowProps {
  rowId: string;
  rowName: string;
  bookings: Booking[];
  totalDays: number;
  onBookingClick: (booking: Booking) => void;
  isHovered: boolean;
  hoveredDayIndex: number | null;
  onCellHover: (rowId: string | null, dayIndex: number | null) => void;
  dateRangeStart: string;
}

const STATUS_COLORS: Record<BookingStatus, string> = {
  confirmed: "#4CAF50",
  pending: "#FF9800",
  in_house: "#2196F3",
  checked_out: "#9E9E9E",
  cancelled: "#F44336",
};

function RoomRowComponent({
  rowId,
  rowName,
  bookings,
  totalDays,
  onBookingClick,
  isHovered,
  hoveredDayIndex,
  onCellHover,
  dateRangeStart,
}: RoomRowProps) {
  console.log("render", rowId);

  // 计算所有预订的绝对位置，CSS overflow 负责裁剪可见区域
  const positionedBookings = useMemo(() => {
    const baseTime = new Date(dateRangeStart).getTime();
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    return bookings.map((b) => {
      const startDay = Math.floor((new Date(b.checkIn).getTime() - baseTime) / MS_PER_DAY);
      const endDay = Math.floor((new Date(b.checkOut).getTime() - baseTime) / MS_PER_DAY);
      return { booking: b, startDay, endDay, color: STATUS_COLORS[b.status] ?? "#ccc" };
    });
  }, [bookings, dateRangeStart]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid #eee",
        background: isHovered ? "#f0f7ff" : "white",
        height: 40,
      }}
    >
      {/* Room name column - sticky on left */}
      <div
        style={{
          position: "sticky",
          left: 0,
          width: 140,
          minWidth: 140,
          padding: "8px 12px",
          fontWeight: 500,
          fontSize: 13,
          borderRight: "1px solid #eee",
          background: "white",
          zIndex: 10,
        }}
      >
        {rowName}
      </div>

      {/* Booking area - absolute positioning for all columns */}
      <div style={{ position: 'relative', flex: 1, height: 40, marginLeft: -140 }}>
        {/* Day cell backgrounds - render all days, use absolute positioning */}
        {Array.from({ length: totalDays }, (_, i) => {
          const dayIndex = i;
          const isCellHovered = isHovered && hoveredDayIndex === dayIndex;
          return (
            <div
              key={dayIndex}
              style={{
                position: 'absolute',
                left: 140 + dayIndex * COLUMN_WIDTH_PX,  // 加上房间列宽度
                width: COLUMN_WIDTH_PX,
                height: 40,
                background: isCellHovered ? "#e3f2fd" : "transparent",
                borderRight: "1px solid #f0f0f0",
              }}
              onMouseEnter={() => onCellHover(rowId, dayIndex)}
              onMouseLeave={() => onCellHover(null, null)}
            />
          );
        })}

        {/* Booking bars - positioned using global day index */}
        {positionedBookings.map(({ booking, startDay, endDay, color }) => {
          const left = 140 + startDay * COLUMN_WIDTH_PX;  // 加上房间列宽度
          const width = (endDay - startDay + 1) * COLUMN_WIDTH_PX;
          return (
            <div
              key={booking.id}
              title={`${booking.guestName} (${booking.status})`}
              onClick={() => onBookingClick(booking)}
              style={{
                position: 'absolute',
                left,
                width: width - 2,
                height: 28,
                top: 6,
                background: color,
                borderRadius: 4,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 6,
                fontSize: 11,
                color: 'white',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                zIndex: 2,
              }}
            >
              {booking.guestName}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 使用 React.memo 包裹，只有 props 变化时才重新渲染
export const RoomRow = React.memo(RoomRowComponent);
