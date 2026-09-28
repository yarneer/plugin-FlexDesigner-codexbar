# CodexBar FlexDesigner Plugin

在 Flexbar 按键上显示 AI 编码服务的剩余配额，数据全部来自本机的 CodexBar CLI。

## Language

**Provider（服务商）**:
CodexBar 能报告用量的一家 AI 服务（如 codex、claude），以 CodexBar CLI `--provider` 的取值为准。
_Avoid_: 平台、厂商、source

**Usage Key（用量按键）**:
Flexbar 上显示某一个 Provider 剩余配额的按键；插件只有这一种按键，Provider 由按键设置选择。
_Avoid_: tile、widget

**Snapshot（快照）**:
对某一个 Provider 的一次查询结果，被所有显示该 Provider 的 Usage Key 共用。
_Avoid_: cache entry、data

**Window（配额窗口）**:
Provider 限流的一个时间窗口（如 5 小时窗口、周窗口），有已用比例，可能有重置时刻（窗口尚未开始时没有）。
_Avoid_: limit、period

**Primary Window（主窗口）**:
CodexBar 标为 primary 的 Window，在 Usage Key 上以大号数字显示；不一定是最短的窗口（如 Kimi 的主窗口是 7 天）。

**Secondary Window（次窗口）**:
CodexBar 标为 secondary 的 Window，在 Usage Key 上以进度条显示。

**Remaining（剩余）**:
Window 中尚未使用的百分比；Usage Key 始终显示剩余而非已用。

**Stale（过期）**:
最近一次刷新失败、Usage Key 仍显示上一份 Snapshot 的状态，必须在按键上可见。

## Relationships

- 一个 **Usage Key** 显示恰好一个 **Provider**
- 一个 **Provider** 任意时刻至多有一份 **Snapshot**，被多个 **Usage Key** 共享
- 一份 **Snapshot** 至少包含 **Primary Window**，可能包含 **Secondary Window**

## Flagged ambiguities

- 「额度」曾同时指 Window 的剩余比例和付费 credits / 账户余额——前者叫 **Remaining**，后者不在当前模型内。
- 「主窗口 = 最短窗口」是早期错误假设；以 CodexBar 的 primary 标记为准。
