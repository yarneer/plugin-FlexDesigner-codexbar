# CodexBar Usage (plugin-FlexDesigner-codexbar)

在 [Flexbar](https://github.com/eniac-FlexDesigner) 按键上显示 [CodexBar](https://github.com/steipete/CodexBar) 报告的 AI 服务剩余配额。所有数据来自本机 CodexBar CLI，插件自身不做任何认证、不访问任何服务商（见 `docs/adr/0001`）。

## 按键

插件只有一种按键 **Usage Key**：在按键设置里选一个 Provider（codex / claude / cursor / gemini / copilot / zai / kimi 排在前面，其余 CodexBar 支持的 id 均可选），按键持续显示：

- 品牌 logo：codex / claude / gemini / copilot / cursor / zai / kimi / qwen / deepseek 显示各自 logo（无 logo 的 Provider 回退文字标签）
- **双进度条**：上面一条 5 小时窗口、下面一条周窗口，各带短标签（`5h` / `7d`）、进度条和剩余百分比（各自按四档着色：>50 绿、>20 黄、>5 橙、其余红；数字永远显示）。claude / codex / GLM / kimi 布局一致；其他 Provider 以 CodexBar 的 primary 窗口排首条，单窗口只画一条（ADR 0002）
- 右上角：首条窗口的重置倒计时（`2h13m` / `3d4h` / `45m`）；窗口未开始时显示窗口名
- 刷新失败时保留上一份数字并标 `·stale`；从未成功则显示错误卡说明原因
- 点击按键立即刷新

同一 Provider 的多个按键共享一次查询；默认 120 秒轮询（设置页可改）；最后一个按键下屏即停止轮询。

## 全局设置

- 刷新间隔（秒，默认 120），保存后立即对所有 Provider 生效
- codexbar 路径（可选）：留空则按 `/opt/homebrew/bin` → `/usr/local/bin` → `PATH` 自动查找

## 开发

要求：Node ≥ 20（在 Node 24 上 `npm install` 会自动修补 flexcli 已被移除的 `assert` JSON-import 语法）、本机已安装 CodexBar。

```bash
npm install
npm test               # 行为测试：不需要 Flexbar / CodexBar
npm run dev            # 链接到 FlexDesigner 并进入 watch+debug
npm run build          # rollup 打包 backend 单文件
npm run plugin:validate
npm run plugin:pack    # 产出 com.xli.codexbar.flexplugin
npm run plugin:install # 安装到本机 FlexDesigner
```

## 结构

```
src/plugin.js      SDK 适配层：事件 → 控制器，KeyView → plugin.draw
src/controller.js  按键控制器（唯一测试接缝）：调度、共享快照、退避、KeyView
src/codexbar.js    CodexBar CLI 客户端：路径查找、执行、类型化失败
src/snapshot.js    归一化（纯函数）：丢弃 identity/pace/details 等
src/format.js      纯格式化：倒计时、窗口名、颜色档位
src/render.js      KeyView → PNG
test/              node --test；fixtures 为实测 CodexBar 0.67.0 输出（脱敏）
```

隐私约束：账号邮箱与账号 ID 不进入 Snapshot、KeyView 或日志（fixture 中故意埋入假邮箱以验证）。
