import React, { useMemo } from "react";
import { Booking, BookingStatus } from "@/types";

const COLUMN_WIDTH_PX = 48;

interface RoomRowProps {
  rowId: string;
  rowName: string;
  bookings: Booking[];
  visibleStartIndex: number;
  visibleEndIndex: number;
  totalDays: number;
  onBookingClick: (booking: Booking) => void;
  isHovered: boolean;
  hoveredDayIndex: number | null;
  onCellHover: (rowId: string | null, dayIndex: number | null) => void;
  dateRangeStart: string;  // 从父组件传递的实际日期范围起点
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
  visibleStartIndex,
  visibleEndIndex,
  totalDays,
  onBookingClick,
  isHovered,
  hoveredDayIndex,
  onCellHover,
  dateRangeStart,
}: RoomRowProps) {
  console.log("render", rowId);

  const getBookingStatus = (status: BookingStatus): string => {
    return STATUS_COLORS[status] ?? "#ccc";
  };

  // 计算预订相对于 dateRangeStart 的位置（全局位置，不是相对于可见范围）
  const visibleBookings = useMemo(() => {
    return bookings
      .filter((b) => {
        const startDay = Math.floor(
          (new Date(b.checkIn).getTime() -
            new Date(dateRangeStart).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        const endDay = Math.floor(
          (new Date(b.checkOut).getTime() -
            new Date(dateRangeStart).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        return endDay >= visibleStartIndex && startDay <= visibleEndIndex;
      })
      .map((b) => {
        const startDay = Math.floor(
          (new Date(b.checkIn).getTime() -
            new Date(dateRangeStart).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        const endDay = Math.floor(
          (new Date(b.checkOut).getTime() -
            new Date(dateRangeStart).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        const color = getBookingStatus(b.status);
        return { booking: b, startDay, endDay, color };
      });
  }, [bookings, visibleStartIndex, visibleEndIndex, dateRangeStart]);

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
        {visibleBookings.map(({ booking, startDay, endDay, color }) => {
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
