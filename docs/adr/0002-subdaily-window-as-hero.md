# 主显窗口规则：亚日窗口优先（覆盖「主显 = CodexBar primary」）

日期：2026-09-28　状态：已接受（所有者提出，见 issue #7）

## 背景

#1 spec 与 CONTEXT.md 原规定：大号数字永远显示 CodexBar 标记为 primary 的窗口（Kimi 的 primary 是 7 天窗口，故 Kimi 主显周用量）。所有者随后要求 claude、codex、GLM、kimi 四家统一显示「5 小时量 + 周用量」——前三家原本就是 5h 主显 + 周进度条，只有 Kimi 相反。

## 决策

主显窗口按以下规则选择，替代「以 CodexBar primary 为准」：

- primary 与 secondary 同时存在、且 **secondary 是亚日窗口（< 1440 分钟）并短于 primary** 时，secondary 主显、primary 作进度条（即 Kimi：5h 主显、7 天周用量进度条）。
- 其余情况（primary 本就是短窗口、两窗口等长如 Cursor 的三个 30 天窗口、只有单窗口）仍以 CodexBar primary 主显。

效果：四家主力 Provider 的卡片布局一致——大号数字 = 5 小时剩余，进度条 = 周用量剩余；其他 Provider 行为不变。倒计时角标跟随主显窗口的重置时刻。

## 后果

- Snapshot 数据层不变：仍是 CodexBar 的 primary/secondary 原样，只是展示层重排，KeyView 不区分「CodexBar primary」与「显示主窗口」。
- CONTEXT.md 的 Primary Window 词条改为「数据层主窗口」语义，并注明展示层规则见本 ADR；story 24（Kimi 主显 CodexBar primary）作废。
- 测试：kimi 断言改为 5h 主显；新增 zai（不触发交换）与 cursor（等长不交换）边界用例。
