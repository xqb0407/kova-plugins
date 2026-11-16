# 企业微信插件

内置企业微信官方 [`wecom-cli`](https://github.com/WecomTeam/wecom-cli) 的 `wecom-unified` 技能与
references，覆盖消息、通讯录、日程、会议、待办、文档、表格、微盘等。插件只负责教 agent
安装 CLI、完成扫码授权、发现并调用命令，不包含 MCP 服务器、HTTP 客户端或任何凭据。

## 安装

需要 Node.js >= 18：

```bash
npm install -g @wecom/cli
wecom-cli --version
```

（可选）同时安装官方 15 个细分技能：

```bash
npx skills add WeComTeam/wecom-cli -y -g
```

## 授权

```bash
wecom-cli auth init      # 扫码；--manual 手动输入 Bot ID / Secret
wecom-cli auth show      # 查看状态
```

授权信息由 CLI 加密保存在 `~/.config/wecom/credentials.enc`，插件不读取、不转发。

## 常用命令

```bash
wecom-cli identity whoami
wecom-cli message aibot sessions list
wecom-cli message aibot send --json '{"chat_id":"...","msg_type":"markdown","markdown":{"content":"..."}}'
wecom-cli contact users search --json '{"keywords":["张三"]}'
wecom-cli --help                 # 列出 service
wecom-cli schema list            # 列出全部方法 schema
```

发送范围是授权人本人，以及机器人最近有消息往来的单聊/群聊；`chat_id` 必须从本次
`sessions list` 结果里取。

## 内置技能

- `wecom-unified`：统一入口，按品类路由到对应命令与 reference。

## 安全约定

- 不在对话里索要或展示 Bot Secret、token。
- 发送前由用户确认收件人与正文。
- 写操作先 `--dry-run`，确认后再执行。
- 失败按 CLI 返回的 JSON 原样反馈，不用 curl / Python 绕过。

## 来源与许可

- 上游：https://github.com/WecomTeam/wecom-cli
- 技能与 CLI 文档快照：`wecom-cli 1.1.0`
- 许可：MIT，见 [LICENSE](LICENSE)
