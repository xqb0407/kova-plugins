# Slack 插件

用官方 Slack CLI 的 `slack api` 调用 Slack Web API，覆盖频道、消息、用户、文件与表情回应。插件只包含技能，负责安装、授权与命令发现，不包含 MCP 服务器、HTTP 客户端或凭据。

## 安装

```bash
curl -fsSL https://downloads.slack-edge.com/slack-cli/install.sh | bash
slack version
```

## 授权

```bash
slack login
slack auth list
```

无浏览器时可用 `slack login --token xoxp-...`；CI 用 `SLACK_BOT_TOKEN` 或 `SLACK_USER_TOKEN`。

## 常用命令

```bash
slack api conversations.list -X GET
slack api conversations.history channel=C123 -X GET
slack api chat.postMessage channel=C123 text="..."
slack api reactions.add channel=C123 timestamp=... name=thumbsup
```

## 内置技能

`slack` —— 频道、消息、用户、文件与表情回应

## 安全约定

- 发消息、删消息、建频道、上传文件前确认目标与内容。
- 群发或 @channel / @here 必须单独确认。
- 不输出 xoxb / xoxp token。

## 来源与许可

- 上游：https://docs.slack.dev/tools/slack-cli/
- 许可：Apache-2.0
