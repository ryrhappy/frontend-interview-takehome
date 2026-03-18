# 修复记录

## 发现的问题

### Bug 1 — 页面启动崩溃：`getBookingStatus` 在声明前被调用
**文件**：`components/BookingGrid/RoomRow.tsx`

`getBookingStatus` 以 `const` 声明，但在它之前的 `useMemo` 回调内已经调用了它。JavaScript 的 `const` 存在"暂时性死区"，执行到声明行之前不可访问，导致页面白屏崩溃。

### Bug 2 — 表头日期与预订色块错位
**文件**：`components/BookingGrid/BookingGrid.tsx`、`components/BookingGrid/RoomRow.tsx`

**问题 1**：表头和预订区域使用不同的日期基准。`BookingGrid` 用 `new Date()` 独立计算表头的 `startDate`，而 `RoomRow` 用的是 `AppContext` 里的 `config.dateRangeStart`，两个 `new Date()` 各自独立执行，在极端情况下会得到不同的日期。

**问题 2**：横向滚动时错位。表头日期容器和预订区域使用不同的定位基准：
- 表头日期元素：`left: i * COLUMN_WIDTH_PX`（相对于容器，从 0 开始）
- 预订色块：`left: startDay * COLUMN_WIDTH_PX`（相对于整个滚动区域）
- 两者相差房间列宽度（140px），导致横向滚动时错位。

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

将函数定义从 `useMemo` 之后移到之前，确保闭包创建时函数已完成初始化。函数逻辑本身不做任何修改，仅调整声明顺序。

### Fix 2 — 统一日期基准，缓存计算结果，稳定 bookings 引用
**文件**：`components/BookingGrid/BookingGrid.tsx`

**问题分析**：
1. 日期基准不统一导致日期计算不一致
2. `bookingsByRoom` 每次都重新计算，没有缓存
3. 空数组引用不稳定导致 `React.memo` 失效
4. 表头和预订区域的定位基准不一致

**解决方案**：

1. **统一日期基准**：使用 `config.dateRangeStart` 作为唯一日期基准，消除两处独立 `new Date()` 导致的不一致风险

2. **缓存日期标签**：对 `dayLabels` 加 `useMemo`，仅 `startDate` 变化时重新计算，避免每次渲染都生成 30 个字符串

3. **稳定 bookings 引用**：将全量 bookings 按 `roomId` 预先分组为 Map，并为所有房间预先初始化空数组。这样：
   - 每个房间直接 `map.get(roomId)` 取数据，从 O(rooms × bookings) 降到 O(bookings) 一次分组
   - 没有预订的房间也能获得稳定的空数组引用，避免 props 浅比较失败

4. **动态计算日期范围起点**：计算所有预订中最早的日期作为 `dateRangeStart`，而不是固定使用当天日期。这样所有预订都能完整显示，不会被截断

5. **统一定位基准**：
   - 表头日期元素：`left: 140 + i * COLUMN_WIDTH_PX`（加上房间列宽度）
   - 预订色块：`left: 140 + startDay * COLUMN_WIDTH_PX`（加上房间列宽度）
   - 使用 `marginLeft: -140` 补偿偏移

### Fix 3 — 稳定 AppContext，移除 hover 状态
**文件**：`context/AppContext.tsx`

将 `hoveredCell` 状态完全移除，不再通过 Context 管理 hover 状态，避免 Context 变化触发所有消费者渲染。`value` 对象用 `useMemo` 包裹，依赖数组为空，确保 `config` 引用永不变化。

### Fix 4 — hover 状态通过 props 传递 + React.memo
**文件**：`components/BookingGrid/BookingGrid.tsx`、`components/BookingGrid/RoomRow.tsx`

**核心思路**：不在子组件中消费 Context，而是在父组件 `BookingGrid` 中管理 hover 状态，通过 props 传递给子组件。

**实现细节**：
1. `BookingGrid` 使用 `useState` 管理 `hoveredRowId` 和 `hoveredDayIndex`
2. 通过 `isHovered={hoveredRowId === room.id}` 判断当前行是否被 hover
3. 只给被 hover 的行传递实际的 `hoveredDayIndex`，其他行传 `null`
4. `RoomRow` 使用 `React.memo` 包裹，配合 props 变化实现真正的按需渲染

**效果**：只有被 hover 的行 props 会变化（`isHovered: false → true`），其他行 props 完全不变（`isHovered: false`，`hoveredDayIndex: null`），`React.memo` 浅比较成功，跳过渲染。

### Fix 5 — 限制 endIndex 上限
**文件**：`hooks/useVisibleRange.ts`

将 `endIndex` 改为 `Math.min(startIndex + VISIBLE_COLUMNS, TOTAL_DAYS - 1)`，从源头保证传递给子组件的索引始终合法，不依赖下游各自防御。

### Fix 6 — 简化 MessagesContext 状态管理
**文件**：`context/MessagesContext.tsx`、`pages/messages/index.tsx`

删除 `MessagesContext` 中的 `activeTicketId` 状态和路由监听 `useEffect`，页面完全以 URL query 为单一数据源获取当前工单 ID。context 只保留真正需要跨页面共享的状态（未读数量、当前 house）。

---

## 关键设计决策

### 为什么不用 Context 管理 hover 状态？

**Context 的局限**：当 Context 值变化时，**所有消费者都会重新渲染**，`React.memo` 无法阻止。

**正确的做法**：对于高频变化、局部使用的状态（如 hover），通过 **props 传递** + **React.memo** 可以实现真正的按需渲染。

---

## 待优化项

- **横向滚动性能**：当前横向滚动时所有 30 行都会重新渲染（因为 `visibleStartIndex`/`visibleEndIndex` props 变化）。这是一个已知的权衡，因为滚动时每行确实需要重新计算可见预订。如需优化，可考虑使用 `useMemo` 缓存计算结果。
- **行级虚拟滚动**：当前 30 行全量渲染，若房间数量增长到数百间，需引入虚拟列表（如 `react-window`）只渲染视口内的行。
- **服务端渲染风险**：`defaultConfig.dateRangeStart` 在模块加载时用 `new Date()` 计算，服务端与客户端若有时区差异会触发 hydration mismatch，可改为在 `useEffect` 中初始化。
