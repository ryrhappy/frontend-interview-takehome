# 修复记录

## 发现的问题

### Bug 1 — 页面启动崩溃：`getBookingStatus` 在声明前被调用
**文件**：`components/BookingGrid/RoomRow.tsx`

`getBookingStatus` 以 `const` 声明，但在它之前的 `useMemo` 回调内已经调用了它。JavaScript 的 `const` 存在"暂时性死区"，执行到声明行之前不可访问，导致页面白屏崩溃。

### Bug 2 — 表头日期与预订色块位置可能错位
**文件**：`components/BookingGrid/BookingGrid.tsx`

`BookingGrid` 用 `new Date()` 独立计算表头的 `startDate`，而 `RoomRow` 用的是 `AppContext` 里的 `config.dateRangeStart`。两个 `new Date()` 各自独立执行，在极端情况下（跨天时刻加载、时区差异）会得到不同的日期，导致表头日期与预订色块错位。

### 性能问题 1 — hover 时全部 30 行同时重渲染
**文件**：`context/AppContext.tsx`、`components/BookingGrid/BookingGrid.tsx`、`components/BookingGrid/RoomRow.tsx`

**根本原因**：React Context 的机制导致当 Context 值变化时，**所有消费该 Context 的组件都会重新渲染**，`React.memo` 无法阻止 Context 变化触发的渲染。

### 性能问题 2 — bookings 引用不稳定导致无效渲染
**文件**：`components/BookingGrid/BookingGrid.tsx`

当房间没有预订数据时，`map.get(roomId) ?? []` 的回退逻辑每次都创建新的空数组引用，导致这些房间的 `bookings` prop 每次父组件渲染时都变化，`React.memo` 失效。

### 性能问题 3 — 每次滚动都重复过滤全量预订数据
**文件**：`components/BookingGrid/BookingGrid.tsx`

每次渲染时对 50 条预订数据执行 30 次完整遍历，复杂度 O(rooms × bookings)。`dayLabels` 数组每次渲染也重新生成，没有缓存。

### 性能问题 4 — 可见列索引无上限限制
**文件**：`hooks/useVisibleRange.ts`

`endIndex` 没有上限限制，滚动到最右侧时可能超出日历范围（30天）。

### 架构问题 — 工单选中状态被三处同时维护
**文件**：`context/MessagesContext.tsx`、`pages/messages/index.tsx`

当前选中工单的 ID 同时存在于 URL query、`MessagesContext` 的 `activeTicketId`、页面的 `initialTicketId`。状态同步逻辑复杂，难以维护。

---

## 应用的修复

### Fix 1 — 将 `getBookingStatus` 移到 `useMemo` 之前
**文件**：`components/BookingGrid/RoomRow.tsx`

将函数定义从 `useMemo` 之后移到之前，确保闭包创建时函数已完成初始化。

```typescript
// 修复前：函数在 useMemo 之后声明
const visibleBookings = useMemo(() => {
  const color = getBookingStatus(b.status) // 错误！此时函数还未声明
  // ...
}, [])

const getBookingStatus = (status: BookingStatus): string => { ... }

// 修复后：函数在 useMemo 之前声明
const getBookingStatus = (status: BookingStatus): string => { ... }

const visibleBookings = useMemo(() => {
  const color = getBookingStatus(b.status) // 正确
  // ...
}, [])
```

### Fix 2 — 统一日期基准，缓存计算结果，稳定 bookings 引用
**文件**：`components/BookingGrid/BookingGrid.tsx`

1. 使用 `config.dateRangeStart` 作为唯一日期基准
2. `dayLabels` 用 `useMemo` 缓存
3. **为所有房间预先初始化空数组**，确保 bookings 引用稳定

```typescript
// 统一日期基准
const startDate = config.dateRangeStart

// 缓存日期标签
const dayLabels = useMemo(() => getDayLabels(startDate, TOTAL_DAYS), [startDate])

// 预先为所有房间初始化空数组，确保引用稳定
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
```

### Fix 3 — 稳定 AppContext，移除 hover 状态
**文件**：`context/AppContext.tsx`

```typescript
// 修复前：value 依赖 hoveredCell，每次 hover 都变化
const value = useMemo(() => ({
  config,
  hoveredCell,
  setHoveredCell
}), [hoveredCell]) // hoveredCell 变化导致 value 变化

// 修复后：移除 hover 状态，value 永不变化
const value = useMemo(() => ({
  config: defaultConfig
}), []) // 空依赖数组，引用永不变化
```

### Fix 4 — hover 状态通过 props 传递 + React.memo
**文件**：`components/BookingGrid/BookingGrid.tsx`、`components/BookingGrid/RoomRow.tsx`

**核心思路**：不在子组件中消费 Context，而是在父组件中管理状态，通过 props 传递。

```typescript
// BookingGrid.tsx - 父组件管理 hover 状态
const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)
const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null)

const handleCellHover = useCallback((rowId: string | null, dayIndex: number | null) => {
  setHoveredRowId(rowId)
  setHoveredDayIndex(dayIndex)
}, [])

// 渲染时只给被 hover 的行传递实际的 hoveredDayIndex
{roomUnits.map(room => {
  const isHovered = hoveredRowId === room.id
  return (
    <RoomRow
      // ...
      isHovered={isHovered}
      hoveredDayIndex={isHovered ? hoveredDayIndex : null} // 关键！
      onCellHover={handleCellHover}
    />
  )
})}

// RoomRow.tsx - 使用 React.memo 包裹
export const RoomRow = React.memo(RoomRowComponent)
```

**效果**：只有被 hover 的行 props 会变化（`isHovered: false → true`），其他行 props 完全不变，`React.memo` 成功跳过渲染。

### Fix 5 — 限制 endIndex 上限
**文件**：`hooks/useVisibleRange.ts`

```typescript
// 修复前：可能超出范围
endIndex: startIndex + VISIBLE_COLUMNS

// 修复后：限制上限
endIndex: Math.min(startIndex + VISIBLE_COLUMNS, TOTAL_DAYS - 1)
```

### Fix 6 — 简化 MessagesContext 状态管理
**文件**：`context/MessagesContext.tsx`、`pages/messages/index.tsx`

删除 `MessagesContext` 中的 `activeTicketId` 状态，页面完全以 URL query 为单一数据源。

```typescript
// pages/messages/index.tsx
const currentTicketId = router.query.ticketId as string | null
const activeTicket = tickets?.find(t => t.id === currentTicketId)
```

---

## 关键设计决策

### 为什么不用 Context 管理 hover 状态？

**Context 的局限**：当 Context 值变化时，**所有消费者都会重新渲染**，`React.memo` 无法阻止。

**正确的做法**：对于高频变化、局部使用的状态（如 hover），通过 **props 传递** + **React.memo** 可以实现真正的按需渲染。

---

## 待优化项

- **行级虚拟滚动**：当前 30 行全量渲染，若房间数量增长到数百间，需引入虚拟列表（如 `react-window`）只渲染视口内的行。
- **服务端渲染风险**：`defaultConfig.dateRangeStart` 在模块加载时用 `new Date()` 计算，服务端与客户端若有时区差异会触发 hydration mismatch，可改为在 `useEffect` 中初始化。
