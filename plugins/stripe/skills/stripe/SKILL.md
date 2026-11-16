---
name: stripe
description: "用官方 Stripe CLI 处理支付开发工作流：登录并切换账号、本地转发 webhook、触发测试事件、查看请求日志、用 get/post 调用任意 Stripe API、管理客户与 fixtures、创建 sandbox。用户提到 Stripe、支付、webhook、订阅、账单、测试模式时使用。live 模式写操作与任何 post/delete 前必须确认。"
---

# Stripe CLI 工作流

本技能随 Kova 的 `stripe` 插件分发，封装官方 `stripe` CLI。插件不内置 HTTP 客户端，不保存 token。

## MCP 与 CLI 的分工

本插件同时提供 Stripe 官方远程 MCP（OAuth）：`https://mcp.stripe.com`。

- 客户、产品、价格、订阅与支付查询优先用 MCP 工具；
- webhook 转发、测试事件、请求日志与 fixtures 继续用 `stripe` CLI；
- 默认测试模式；live 模式写操作前先展示目标对象与金额并确认。

## 前置检查

1. 检查版本：`stripe version`
2. 未安装时：

```bash
curl -fsSL https://cli.stripe.com/install.sh | sh
# 或
npm i -g @stripe/cli@latest
```

3. 登录：`stripe login`（浏览器配对码）；检查 `stripe config --list`。
4. 多账号：`stripe login list`、`stripe switch`、`stripe logout`。
5. CI 使用 `STRIPE_API_KEY` 或全局 `--api-key`；默认使用 test 模式，`--live` 才动真实数据。

## 常用命令

```bash
# webhook
stripe listen --forward-to http://localhost:4242/webhook \
  --events payment_intent.succeeded
stripe trigger payment_intent.succeeded
stripe events resend evt_xxx

# 请求日志
stripe logs tail --filter-status-code-type 4XX --format JSON

# API
stripe get /v1/charges --limit 5
stripe post /v1/payment_intents -d amount=2000 -d currency=usd \
  -d "payment_method_types[]=card"
stripe customers create --email=a@b.com

# 测试数据
stripe fixtures ./fixtures.json
stripe sandbox create --email=a@b.com
stripe config --list
```

## 输出与脚本

- 资源命令、`get`、`post`、`delete` 默认输出 JSON。
- `logs tail` 用 `--format JSON`；`listen` 用 `--print-json`。
- 用 `jq` 提取字段；判断成功以退出码为准。

## 安全约定

- 任何 `post` / `delete` 前，先展示资源、金额、币种、客户和模式（test/live）。
- `--live` 会操作真实资金与客户，必须获得用户明确同意，并在命令中显式确认。
- `-c/--confirm` 会跳过确认；非用户明确要求不要使用。
- 不输出 `sk_live_` / `sk_test_` / `rk_` 密钥。
- webhook 转发只连本地开发端口，不要把生产 webhook 指向临时隧道。

## 参考

- CLI：https://docs.stripe.com/cli
- 子命令以 `stripe <command> --help` 为准。
