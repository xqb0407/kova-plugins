# Stripe 插件

用官方 Stripe CLI 转发和触发 webhook、调用 API、查看请求日志、管理客户与测试数据。插件同时提供技能与官方 MCP 配置：CLI 负责 webhook 转发、请求日志与 fixtures，MCP 提供面向 agent 的 Stripe 资源查询与操作工具；不内置 HTTP 客户端，也不保存凭据。

## 安装

```bash
curl -fsSL https://cli.stripe.com/install.sh | sh
# 或 npm i -g @stripe/cli@latest
stripe version
```

## 授权

```bash
stripe login
stripe config --list
```

CI 使用 `STRIPE_API_KEY`；默认 test 模式，`--live` 才操作真实数据。

## 常用命令

```bash
stripe listen --forward-to http://localhost:4242/webhook
stripe trigger payment_intent.succeeded
stripe get /v1/charges --limit 5
stripe logs tail --format JSON
```

## MCP 服务器

插件附带 Stripe 官方远程 MCP：`https://mcp.stripe.com`（OAuth）

- 默认在测试模式验证；切换到 live 模式前必须确认账号与影响范围。
- 客户、产品、价格、订阅与支付查询优先用 MCP；webhook 转发、触发测试事件与请求日志走 `stripe` CLI。
- 任何创建、退款、取消订阅等写操作前，先展示目标对象与金额并获得确认。

## 内置技能

`stripe` —— webhook、API 调用、请求日志、客户与测试数据

## 安全约定

- 任何 post/delete 前确认资源、金额、币种与模式。
- `--live` 必须获得明确同意。
- `-c/--confirm` 不要默认使用。
- 不输出 Stripe 密钥。

## 来源与许可

- 上游：https://docs.stripe.com/cli
- 许可：Apache-2.0（npm wrapper 为 MIT）
