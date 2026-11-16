# 钉钉插件

内置钉钉官方 [`dws`](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli) 的 16 个
`dingtalk-*` 技能，覆盖群聊消息、联系人、日历、待办、文档、AI 表格、邮件、会议纪要等。
插件只负责教 agent 安装 CLI、完成浏览器授权、发现并调用命令，不包含 MCP 服务器、
HTTP 客户端或任何凭据。

## 安装

```bash
npm install -g dingtalk-workspace-cli
dws --version
```

也可以使用安装脚本或 Homebrew：

```bash
curl -fsSL https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install.sh | sh

brew tap DingTalk-Real-AI/dingtalk-workspace-cli https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli.git
brew install dingtalk-workspace-cli
```

国内网络参考官方 README 的 China mirror（Gitee / npmmirror）。

## 授权

```bash
dws auth login      # 浏览器授权；--device 用于无头环境
dws auth status
```

首次登录需要企业管理员开通 CLI 访问；未开通时按提示申请。

## 常用命令

```bash
dws contact user search --query "张三" --format json
dws contact user get-self --format json
dws chat +chat-search --query "项目群" --format json
dws chat +chat-messages --group "<群 ID 或群名>" --no-reactions
dws chat +dm --to "张三" --content "..." --dry-run
dws chat +send-to-group --group "项目群" --content "..." --dry-run
dws <path> --help
dws schema "<path>" --compact
```

去掉 `--dry-run` 才会真正发送。

## 内置技能

`dingtalk-shared`、`dingtalk-chat`、`dingtalk-contact`、`dingtalk-calendar`、`dingtalk-todo`、
`dingtalk-doc`、`dingtalk-drive`、`dingtalk-wiki`、`dingtalk-aitable`、`dingtalk-mail`、
`dingtalk-minutes`、`dingtalk-tag`、`dingtalk-event`、`dingtalk-aicard`、`dingtalk-aisearch`、
`dingtalk-misc`。

## 安全约定

- 发送前由用户确认对象、正文与身份。
- 目标零命中或有多个候选时停下让用户选。
- 写操作先 `--dry-run`，用户确认后再加 `--yes`。
- 不输出 token、refresh token、appSecret、webhook token。
- 失败按原错误反馈，不换命令绕过。

## 来源与许可

- 上游：https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli
- 技能与 CLI 文档快照：`dws 1.0.64`
- 许可：Apache-2.0，见 [LICENSE](LICENSE)
