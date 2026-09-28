# CodexBar CLI 是唯一数据源，按 Provider 分别调用

插件不自己对接任何 AI 服务的 API 或本地日志，只通过 `codexbar usage --provider <id> --json` 获取数据；每个 Provider 单独起一个进程、单独缓存和退避，而不是用一次 `--provider all` 喂所有按键。

参考实现 plugin-FlexDesigner-tokens 自己调用 Claude 的非官方 OAuth 接口、读 Codex 的 rollout 日志，要维护认证刷新与重新登录流程；交给 CodexBar 后这些全部消失，且自动获得它支持的 100+ Provider。代价是必须安装 CodexBar，且插件只能跑在 macOS。

不用 `--provider all`：它会拉取 app 里所有启用的 Provider，任何一家走 web 源超时都会拖住全部按键，也无法按 Provider 标记 Stale 或退避。此外 `--provider a,b` 不被识别为列表（实测退化为全部）。

实测（CodexBar 0.67.0，2026-09-28）补充的失败形态：成功时退出码 0、stdout 为单条目 JSON 数组；失败时退出码 1，条目带 `error: {message, kind, code}` 且 stdout 仍是合法 JSON——所以解析 stdout 要先于看退出码。Provider 在 app 里未启用（`enabled: false`）的可靠信号是错误消息 `No available fetch strategy for <id>.`；已启用但无会话（如 devin 未登录）则返回带指引的长消息，属于普通 provider 错误。
