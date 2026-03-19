# DECISIONS.md

## 发现的问题

**Bug 1 — 页面启动白屏：`getBookingStatus` 在声明前被调用**
`components/BookingGrid/RoomRow.tsx`：`getBookingStatus` 以 `const` 声明，但在它之前的 `useMemo` 回调内已调用它。`const` 存在暂时性死区，导致页面白屏崩溃。

**Bug 2 — 表头日期与预订色块错位**
`BookingGrid.tsx` / `RoomRow.tsx`：表头与预订区域使用了不同的日期基准和定位基准，横向滚动时二者偏移不一致，产生视觉错位。

**Bug 3 — bookings 引用不稳定导致 React.memo 失效**
`BookingGrid.tsx`：`bookingsByRoom` 每次渲染都重新计算；`map.get(roomId) ?? []` 每次返回新的空数组引用，导致子组件无法命中 memo 缓存。

**Bug 4 — hover 时全部 30 行同时重渲染**
`AppContext.tsx`：hover 状态存在 Context 中，任意单元格 hover 触发 Context 更新，所有消费该 Context 的组件全部重渲染，`React.memo` 无法阻止。

**Bug 5 — 横向滚动触发全部 30 行重渲染**
`useVisibleRange.ts` / `BookingGrid.tsx`：`startIndex`/`endIndex` 随滚动变化后作为 props 传给所有 30 行，每次滚动全部行 props 都变化。根本原因是误用了 JS 层虚拟渲染——日期格子本就全量绝对定位，CSS `overflow: hidden` 已负责裁剪，JS 层过滤反而引入了滚动重渲染。

**Bug 6 — 工单选中状态被三处同时维护**
`MessagesContext.tsx` / `pages/messages/index.tsx`：选中工单 ID 同时存在于 URL query、Context 的 `activeTicketId`、页面的 `initialTicketId`，三处同步逻辑复杂易出错。

**Bug 7 — 点击消息后未读提示不消失**
`pages/messages/index.tsx`：点击工单只更新 URL query，未更新 `unread` 字段，未读圆点和字体粗细保持不变，未读计数也未同步。

**Bug 8 — useMemo 内重复计算日期**
`RoomRow.tsx`：`.filter()` 和 `.map()` 各自独立计算 `startDay`/`endDay`，同一预订的日期被计算两遍。

**Bug 9 — 共享常量分散在多处 hardcode**
`useVisibleRange.ts` / `BookingGrid.tsx` / `RoomRow.tsx`：`COLUMN_WIDTH_PX`、`TOTAL_DAYS`、`VISIBLE_COLUMNS` 各自定义，修改时需同步多处。

**Bug 10 — useEffect 依赖项不精确**
`MessagesContext.tsx`：`useEffect` 依赖整个 `router.query` 对象，Next.js 每次渲染都会产生新引用，effect 被过度触发。

**Bug 11 — fetcher 缺少 HTTP 状态码检查**
`pages/index.tsx` / `pages/messages/index.tsx`：`fetch().then(r => r.json())` 不检查 `r.ok`，API 返回 4xx/5xx 时错误状态静默丢失，SWR 无法感知失败。

---

## 应用的修复

**Fix 1 — 调整 `getBookingStatus` 声明顺序**
将函数定义移到 `useMemo` 之前，消除暂时性死区，函数逻辑本身不变。

**Fix 2 — 统一日期基准与定位基准**
以所有预订中最早的 `checkIn` 作为唯一 `dateRangeStart`，通过 props 下传；表头和预订色块统一使用 `left: 140 + dayIndex * COLUMN_WIDTH_PX` + `marginLeft: -140`，确保二者定位完全一致。

**Fix 3 — 稳定 bookingsByRoom 引用**
用 `useMemo` 缓存 `bookingsByRoom`；预先为所有房间初始化空数组，`map.get(roomId)` 始终返回稳定引用，`React.memo` 得以正常工作。

**Fix 4 — hover 状态下沉到父组件，通过 props 传递**
从 `AppContext` 移除 hover 状态；`BookingGrid` 用 `useState` 管理 `hoveredRowId` / `hoveredDayIndex`；只向被 hover 的行传入实际 `hoveredDayIndex`，其他行传 `null`；`RoomRow` 用 `React.memo` 包裹，仅被 hover 行重渲染。

**Fix 5 — 移除 JS 层可见性过滤，让 CSS 负责裁剪**
删除 `useVisibleRange.ts`；`RoomRow` 移除 `visibleStartIndex`/`visibleEndIndex` props，改为对所有预订计算绝对位置、全量渲染；`BookingGrid` 移除 `onScroll` 处理器。滚动时零 React 重渲染，由浏览器原生滚动处理。

**Fix 6 — URL query 作为单一数据源**
删除 `MessagesContext` 中的 `activeTicketId` 状态和路由监听 `useEffect`；页面直接从 `router.query.ticketId` 读取当前工单 ID，消除多处同步。

**Fix 7 — 消息已读状态乐观更新**
点击未读工单时，通过 SWR `mutate` 立即更新本地缓存将 `unread` 置为 `false`，同步更新 Context 中的 `unreadCount`，UI 即时响应。传入 `false` 表示不触发重新验证（mock 数据场景）。

**Fix 8 — 合并重复日期计算为单次遍历**
将 `.filter().map()` 改为 `.reduce()`，每个预订只计算一次 `startDay`/`endDay`，同时内联消除 `getBookingStatus` 辅助函数。

**Fix 9 — 集中管理共享常量**
新增 `lib/constants.ts`，统一导出 `COLUMN_WIDTH_PX`、`TOTAL_DAYS`、`VISIBLE_COLUMNS`，三处引用改为 import，单一修改点。

**Fix 10 — 精确 useEffect 依赖**
将依赖从 `[router.query]` 改为 `[router.query.houseId]`，effect 只在 houseId 实际变化时触发。

**Fix 11 — fetcher 加 r.ok 检查**
在 `.then()` 中先判断 `r.ok`，非 2xx 时抛出错误，SWR 可正确捕获并暴露 `error` 状态。

---

## 权衡取舍

**未添加错误 UI**：fetcher 已加 `r.ok` 检查，SWR 的 `error` 状态可获取，但页面没有渲染错误提示。对于 mock 数据场景优先级低；真实项目中应补充。

**未处理 API 路由的 setTimeout 内存泄漏**：三个 API 路由均用 `setTimeout` 模拟延迟，客户端断连后 timer 仍会触发。这是 mock 数据层的已知问题，修改会改变项目原始意图，故不动。

**hover 状态保留在 React 而非 CSS**：hover 高亮目前由 React state 控制。对于 30 行规模可接受；行数极大时可改为纯 CSS `:hover` 选择器，完全绕开 JS。

**未引入行级虚拟滚动**：30 行全量渲染性能足够。若房间数增长至数百间，需引入 `react-window` 等虚拟列表库，但当前规模不值得增加依赖复杂度。

---

## 如果有更多时间

- **SSR hydration 风险**：`defaultConfig.dateRangeStart` 在模块加载时用 `new Date()` 计算，服务端与客户端时区不一致时会触发 hydration mismatch，应改为在 `useEffect` 中初始化。
- **行级虚拟滚动**：房间数量增长到数百间时引入 `react-window`，只渲染视口内的行。
- **横向虚拟化**：日期范围扩展到 365 天时，通过 ref 或 CSS 变量传递滚动位置（而非 React state），实现列级虚拟渲染且不触发重渲染。
- **错误与加载状态**：补充 SWR `error` / `isLoading` 的 UI 展示，提升用户体验。
