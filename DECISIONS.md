## 发现的问题

### Bug 1 — 页面启动崩溃：`getBookingStatus` 在声明前被调用
**文件**：`components/BookingGrid/RoomRow.tsx`

`getBookingStatus` 以 `const` 声明，但在它之前的 `useMemo` 回调内已经调用了它。JavaScript 的 `const` 存在"暂时性死区"，执行到声明行之前不可访问，因此页面一加载就报 `ReferenceError: Cannot access 'getBookingStatus' before initialization`，白屏崩溃。

### Bug 2 — 表头日期与预订色块位置可能错位
**文件**：`components/BookingGrid/BookingGrid.tsx`

`BookingGrid` 用 `new Date()` 独立计算表头的 `startDate`，而 `RoomRow` 用的是 `AppContext` 里的 `config.dateRangeStart`（另一个 `new Date()`）。两个 `new Date()` 各自独立执行，在极端情况下（跨天时刻加载、时区差异）会得到不同的日期，导致表头日期与预订色块错位一天。

### 性能问题 1 — hover 时全部 30 行同时重渲染
**文件**：`context/AppContext.tsx`、`components/BookingGrid/RoomRow.tsx`

`AppProvider` 每次渲染时 `value` 都是新建的对象，引用必然变化，导致所有订阅 `AppContext` 的组件（30 个 `RoomRow` + `Sidebar`）无论数据是否真的改变都会重渲染。加之 `RoomRow` 没有 `React.memo`，父组件任何渲染都会带动所有行重渲染。`console.log("render", rowId)` 正是用来暴露这个问题的——鼠标移过任意一格，控制台会打印 30 条日志。

### 性能问题 2 — 每次滚动都重复过滤全量预订数据
**文件**：`components/BookingGrid/BookingGrid.tsx`

`roomUnits.map()` 内部对每个房间调用 `bookings.filter(...)`，没有任何缓存。每次滚动触发渲染时，都对 50 条预订数据执行 30 次完整遍历，复杂度 O(rooms × bookings)。同样，表头的 `dayLabels` 数组（30 个日期字符串）每次渲染都重新生成，也没有缓存。

### 性能问题 3 — 可见列索引无上限限制
**文件**：`hooks/useVisibleRange.ts`

`endIndex = startIndex + VISIBLE_COLUMNS`，固定加 14，没有考虑日历只有 30 天（索引上限 29）。滚动到最右侧时 `endIndex` 会超出范围。`BookingGrid` 表头有 `if (dayIndex >= TOTAL_DAYS) return null` 做防护，但 `RoomRow` 计算预订色块宽度时直接使用传入的 `endIndex`，存在越界隐患。

### 架构问题 — 工单选中状态被三处同时维护
**文件**：`context/MessagesContext.tsx`、`pages/messages/index.tsx`

当前选中工单的 ID 同时存在于：URL query 参数、`MessagesContext` 的 `activeTicketId` state、页面的 `initialTicketId` prop。`MessagesContext` 内部通过 `useEffect` 监听路由变化来同步状态，`setActiveTicketId` 在页面组件中被解构但从未直接调用，实际由 context 内部副作用驱动——逻辑冗余，阅读和调试都有误导性。

---

## 应用的修复

### Fix 1 — 将 `getBookingStatus` 移到 `useMemo` 之前（`RoomRow.tsx`）

将函数定义从 `useMemo` 之后移动到之前，保证闭包创建时函数已完成初始化。函数逻辑本身不做任何修改，仅调整声明顺序。这是最小化修复，不引入任何风险。

### Fix 2 — 统一日期基准，缓存 `dayLabels` 和 `bookingsByRoom`（`BookingGrid.tsx`）

将 `startDate` 改为读取 `config.dateRangeStart`，消除两处独立 `new Date()` 导致的不一致风险；对 `dayLabels` 加 `useMemo`，仅 `startDate` 变化时重新计算；将 `bookings` 按 `roomId` 预先分组为 Map，每个房间直接 `map.get(roomId)` 取数据，从 O(rooms × bookings) 降到 O(bookings) 一次分组。

### Fix 3 — 用 `useMemo` 稳定 `AppContext` value（`AppContext.tsx`）

对 `value` 对象包裹 `useMemo`，仅 `hoveredCell` 真正变化时才生成新对象引用，避免 `AppProvider` 每次渲染都向下广播无效更新。

### Fix 4 — 对 `RoomRow` 应用 `React.memo`（`RoomRow.tsx`）

用 `React.memo` 包裹 `RoomRow`，props 未变化时跳过渲染。需配合 Fix 3 同时生效：Fix 3 减少 context 变化次数，Fix 4 阻止 props 不变时的无效渲染。

### Fix 5 — 限制 `endIndex` 上限（`useVisibleRange.ts`）

将 `endIndex` 改为 `Math.min(startIndex + VISIBLE_COLUMNS, TOTAL_DAYS - 1)`，从源头保证传递给子组件的索引始终合法，不依赖下游各自防御。

### Fix 6 — 简化 MessagesContext 状态管理（`MessagesContext.tsx`、`pages/messages/index.tsx`）

删除 `MessagesContext` 中的 `activeTicketId` 状态和路由监听 `useEffect`，以及页面组件中对它的依赖。页面完全以 URL query 为单一数据源获取当前工单 ID，消除三处状态同步的复杂逻辑。context 只保留真正需要跨页面共享的状态（未读数量、当前 house）。

---

## 权衡取舍

**保留了 `console.log("render", rowId)`**：该日志是项目有意放置的性能观测点，修复前后对比效果（30 条 → 1 条）可直接在控制台验证，删除会让优化效果无法直观确认。

**未将 `hoveredCell` 拆分到独立 context**：最彻底的方案是将 `hoveredCell` 单独拆为 `HoverContext`，`RoomRow` 只订阅 hover，完全隔离其他状态变化。但这需要重构所有相关组件的引用，改动量较大。当前 `useMemo` + `React.memo` 组合已能显著降低无效渲染，选择更保守的方案。

---

## 如果有更多时间

- **彻底拆分 `hoveredCell` context**：独立为 `HoverContext`，`RoomRow` 按行订阅，实现真正的按需渲染，而不是依赖 memo 的浅比较拦截。
- **行级虚拟滚动**：当前 30 行全量渲染在 DOM 中，若房间数量增长到数百间，需引入虚拟列表（如 `react-window`）只渲染视口内的行。
- **服务端渲染水合风险**：`defaultConfig.dateRangeStart` 在模块加载时用 `new Date()` 计算，服务端与客户端若有时区差异会触发 hydration mismatch，可改为在 `useEffect` 中初始化。
