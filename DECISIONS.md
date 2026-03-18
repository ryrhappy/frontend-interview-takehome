# 修复记录

## 发现的问题

### Bug 1 — 页面启动崩溃：`getBookingStatus` 在声明前被调用
**文件**：`components/BookingGrid/RoomRow.tsx`

`getBookingStatus` 以 `const` 声明，但在它之前的 `useMemo` 回调内已经调用了它。JavaScript 的 `const` 存在"暂时性死区"，执行到声明行之前不可访问，导致页面白屏崩溃。

### Bug 2 — 表头日期与预订色块错位
**文件**：`components/BookingGrid/BookingGrid.tsx`、`components/BookingGrid/RoomRow.tsx`

**问题 1**：日期基准不统一。表头和预订区域使用不同的日期基准，可能导致日期计算不一致。

**问题 2**：横向滚动时错位。表头日期和预订色块使用不同的定位基准，相差房间列宽度（140px），导致滚动时错位。

### Bug 3 — bookings 引用不稳定导致无效渲染
**文件**：`components/BookingGrid/BookingGrid.tsx`

**问题 1**：`bookingsByRoom` 每次渲染都重新计算，没有缓存。

**问题 2**：空数组引用不稳定。`map.get(roomId) ?? []` 每次都创建新的空数组引用，导致 `React.memo` 失效。

### Bug 4 — hover 时全部 30 行同时重渲染
**文件**：`context/AppContext.tsx`、`components/BookingGrid/BookingGrid.tsx`、`components/BookingGrid/RoomRow.tsx`

通过 React Context 管理 hover 状态，当 Context 值变化时，**所有消费该 Context 的组件都会重新渲染**，`React.memo` 无法阻止。

### Bug 5 — 可见列索引无上限限制
**文件**：`hooks/useVisibleRange.ts`

`endIndex` 没有上限限制，滚动到最右侧时可能超出日历范围（30天）。

### Bug 6 — 工单选中状态被三处同时维护
**文件**：`context/MessagesContext.tsx`、`pages/messages/index.tsx`

当前选中工单的 ID 同时存在于 URL query、`MessagesContext` 的 `activeTicketId`、页面的 `initialTicketId`。状态同步逻辑复杂，难以维护。

### Bug 7 — 点击消息后未读提示不消失
**文件**：`pages/messages/index.tsx`

点击消息查看时，只更新了 URL query，没有更新消息的 `unread` 字段，导致未读小圆点和字体粗细不变化。未读数量也未同步更新。

---

## 应用的修复

### Fix 1 — 将 `getBookingStatus` 移到 `useMemo` 之前
**文件**：`components/BookingGrid/RoomRow.tsx`

将函数定义从 `useMemo` 之后移到之前，确保闭包创建时函数已完成初始化。函数逻辑本身不做任何修改，仅调整声明顺序。

### Fix 2 — 统一日期基准，统一定位基准
**文件**：`components/BookingGrid/BookingGrid.tsx`、`components/BookingGrid/RoomRow.tsx`

1. **统一日期基准**：使用 `config.dateRangeStart` 作为唯一日期基准，消除独立 `new Date()` 导致的不一致风险

2. **统一定位基准**：表头日期和预订色块都使用 `left: 140 + dayIndex * COLUMN_WIDTH_PX`，并用 `marginLeft: -140` 补偿偏移

3. **动态计算日期范围起点**：计算所有预订中最早的日期作为 `dateRangeStart`，确保所有预订完整显示

### Fix 3 — 稳定 bookings 引用，缓存计算结果
**文件**：`components/BookingGrid/BookingGrid.tsx`

1. **缓存 bookingsByRoom**：用 `useMemo` 包裹，避免每次渲染都重新计算

2. **稳定空数组引用**：预先为所有房间初始化空数组，确保 `map.get(roomId)` 始终返回稳定引用

### Fix 4 — hover 状态通过 props 传递 + React.memo
**文件**：`context/AppContext.tsx`、`components/BookingGrid/BookingGrid.tsx`、`components/BookingGrid/RoomRow.tsx`

1. **移除 Context 中的 hover 状态**：从 `AppContext` 中移除 `hoveredCell`，用 `useMemo` 包裹 `value` 确保引用永不变化

2. **父组件管理 hover 状态**：`BookingGrid` 使用 `useState` 管理 `hoveredRowId` 和 `hoveredDayIndex`

3. **通过 props 传递**：只给被 hover 的行传递实际的 `hoveredDayIndex`，其他行传 `null`

4. **React.memo 优化**：`RoomRow` 用 `React.memo` 包裹，只有被 hover 的行 props 变化，其他行跳过渲染

### Fix 5 — 限制 endIndex 上限
**文件**：`hooks/useVisibleRange.ts`

将 `endIndex` 改为 `Math.min(startIndex + VISIBLE_COLUMNS, TOTAL_DAYS - 1)`，从源头保证传递给子组件的索引始终合法，不依赖下游各自防御。

### Fix 6 — 简化 MessagesContext 状态管理
**文件**：`context/MessagesContext.tsx`、`pages/messages/index.tsx`

删除 `MessagesContext` 中的 `activeTicketId` 状态和路由监听 `useEffect`，页面完全以 URL query 为单一数据源获取当前工单 ID。context 只保留真正需要跨页面共享的状态（未读数量、当前 house）。

### Fix 7 — 消息已读状态乐观更新
**文件**：`pages/messages/index.tsx`

**问题**：点击消息查看时未读状态不更新。

**解决方案**：使用 SWR 的 `mutate` 函数实现乐观更新。当点击未读消息时：
1. 通过 `mutate` 立即更新本地缓存，将 `unread` 设为 `false`
2. 同步更新 context 中的 `unreadCount`
3. UI 立即响应（小圆点消失、字体变细）

传递 `false` 作为第三个参数表示不触发重新验证（因为使用的是 mock 数据）。

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
