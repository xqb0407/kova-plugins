---
name: slack
description: "用官方 Slack CLI 操作 Slack：列出频道和用户、读取频道历史、发送与编辑消息、上传文件、添加表情回应。用户提到 Slack、slack-cli、频道、发消息、读聊天记录、上传文件时使用。发消息、删除消息、上传文件前必须确认目标频道与内容。"
---

# Slack CLI 工作流

本技能随 Kova 的 `slack` 插件分发，封装 Slack 官方 `slack` CLI。插件不内置 HTTP 客户端，不保存 token。

## 前置检查

1. 检查版本：`slack version`
2. 未安装时：

```bash
curl -fsSL https://downloads.slack-edge.com/slack-cli/install.sh | bash
```

3. 登录：`slack login`（浏览器 OAuth）；无浏览器时 `slack login --token xoxp-...`。
4. 检查：`slack auth list`、`slack auth token`。
5. token 优先级：`--token` > `--app` > `SLACK_BOT_TOKEN` > `SLACK_USER_TOKEN`。不要打印 token。

## 常用命令

```bash
slack api auth.test

# 频道与用户
slack api conversations.list -X GET
slack api conversations.history channel=C123 -X GET
slack api users.list -X GET

# 消息
slack api chat.postMessage channel=C123 text="..."
slack api chat.update channel=C123 ts=1700000000.000100 text="edited"

# 表情与文件
slack api reactions.add channel=C123 timestamp=... name=thumbsup
slack api files.upload channels=C123 filename=report.csv
```

`slack api` 可以直接调用任意 Slack Web API 方法：`slack api <method> key=value ...`。

## 输出与脚本

- `slack api` 的响应默认就是 JSON；不要把它当成人类可读表格解析。
- `--json` 表示 JSON 请求体，不是输出格式；查询参数用 `key=value`，GET 方法加 `-X GET`。
- 需要翻页时读取响应里的 `response_metadata.next_cursor`，再传 `cursor=`。

## 安全约定

- 发送、编辑、删除消息，创建频道，上传文件前，先向用户展示频道名、消息正文和发送身份。
- 群发或提及 `@channel` / `@here` 必须单独确认。
- 不输出 `xoxb-` / `xoxp-` token。
- 失败按原错误反馈；权限不足时说明缺少的 scope，不要换方法绕过。

## 参考

- Slack CLI：https://docs.slack.dev/tools/slack-cli/
- slack api：https://docs.slack.dev/tools/slack-cli/reference/commands/slack_api/
- 方法参数以 `--help` 和 Slack Web API 文档为准。
