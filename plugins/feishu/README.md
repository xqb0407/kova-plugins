# 飞书 / Lark 插件

内置飞书官方 [`lark-cli`](https://github.com/larksuite/cli) 的 25 个 `lark-*` 技能，覆盖 IM、
通讯录、云文档、云盘、电子表格、多维表格、日历、任务、邮件、会议、审批等。插件只负责教
agent 安装 CLI、完成 OAuth 授权、发现并调用命令，不包含 MCP 服务器、HTTP 客户端或任何凭据。

## 安装

```bash
npm install -g @larksuite/cli@1.0.100
lark-cli --version
```

官方安装器 `npx @larksuite/cli@latest install` 会同时安装全局 Skills；本插件已经内置技能，
不需要再运行安装器或 `npx skills add`。

## 授权

```bash
lark-cli auth login --recommend           # 推荐权限集
lark-cli auth login --domain im,contact   # 只授权指定域
lark-cli auth status
```

无头环境：

```bash
lark-cli auth login --domain im --no-wait
lark-cli auth login --device-code <CODE>
```

飞书与 Lark 国际版共用同一 CLI，登录时选择对应租户即可。

## 常用命令

```bash
lark-cli contact +search-user --query "张三" --as user
lark-cli contact +get-user --as user
lark-cli im +chat-list --format json
lark-cli im +chat-search --query "项目群" --format json
lark-cli im +chat-members-list --chat-id oc_xxx --format json
lark-cli im +chat-messages-list --chat-id oc_xxx --format json
lark-cli im +messages-send --chat-id oc_xxx --markdown "..." --dry-run
lark-cli skills list              # 浏览内置技能
lark-cli skills read lark-im      # 读取某个技能的完整说明
```

## 内置技能

`lark-shared`、`lark-im`、`lark-contact`、`lark-doc`、`lark-drive`、`lark-sheets`、`lark-base`、
`lark-wiki`、`lark-markdown`、`lark-calendar`、`lark-task`、`lark-mail`、`lark-meeting`、
`lark-note`、`lark-okr`、`lark-approval`、`lark-attendance`、`lark-slides`、`lark-whiteboard`、
`lark-event`、`lark-apps`、`lark-openapi-explorer`、`lark-skill-maker`，以及
`lark-workflow-meeting-summary`、`lark-workflow-standup-report` 两个工作流。

## 安全约定

- 发送前由用户确认收件人/群、正文与发送身份。
- `--as user` 是用户本人；`--as bot` 是应用机器人，机器人必须在目标群里。
- 写操作先 `--dry-run`，确认后再执行。
- 用 `{"ok": true}` 或退出码判断成功，不要用 `code == 0`。
- 不输出 token、appSecret。

## 来源与许可

- 上游：https://github.com/larksuite/cli
- 技能与 CLI 文档快照：`lark-cli 1.0.100`
- 许可：MIT，见 [LICENSE](LICENSE)
