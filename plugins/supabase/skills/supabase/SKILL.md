---
name: supabase
description: "用官方 supabase CLI 处理 Supabase 工作流：初始化与启动本地栈、链接远端项目、创建和应用数据库迁移、生成 TypeScript 类型、管理 secrets、开发和部署 Edge Functions。用户提到 Supabase、Postgres、迁移、RLS、Edge Functions 时使用。db push/reset、secrets 变更和函数部署前必须确认目标项目。"
---

# Supabase CLI 工作流

本技能随 Kova 的 `supabase` 插件分发，封装官方 `supabase` CLI。插件不内置 HTTP 客户端，不保存凭据。

## MCP 与 CLI 的分工

本插件同时提供 Supabase 官方远程 MCP（默认只读）：`https://mcp.supabase.com/mcp?read_only=true`。

- 表结构、数据查询与项目信息优先用 MCP 工具；
- 本地开发栈、迁移、类型生成与函数部署继续用 `supabase` CLI；
- MCP 默认只读；确需写入时再调整端点参数，并先确认项目与 SQL。

## 前置检查

1. 检查版本：`supabase --version`
2. 安装方式：

```bash
brew install supabase/tap/supabase
# 或作为项目依赖
npm i supabase --save-dev
npx supabase --version
```

3. 登录：`supabase login`；CI 使用 `SUPABASE_ACCESS_TOKEN`。
4. 本地栈需要 Docker 运行中：`docker info`。
5. 链接远端项目：`supabase link --project-ref <ref>`。

## 常用命令

```bash
# 本地开发
supabase init
supabase start
supabase stop

# 链接与迁移
supabase link --project-ref <ref>
supabase migration new add_users
supabase migration up
supabase db push
supabase db reset

# 类型与 secrets
supabase gen types typescript --local --schema public
supabase secrets set --env-file .env
supabase secrets list

# Edge Functions
supabase functions new hello
supabase functions serve hello --env-file .env
supabase functions deploy hello
```

## 输出与脚本

- 全局 `-o json` 输出结构化结果，适合脚本。
- `supabase gen types` 直接输出 TypeScript，可重定向到文件。
- 迁移前先用 `supabase migration list` 确认本地/远端差异。
- 判断成功以退出码为准。

## 安全约定

- `db push`、`db reset`、`secrets set`、`functions deploy` 会改动远端数据或线上函数，执行前必须展示项目 ref、环境和迁移列表并获得明确同意。
- `db reset` 会清空本地数据；对远端项目不要使用。
- 不输出 `SUPABASE_ACCESS_TOKEN`、`SUPABASE_DB_PASSWORD` 或 service role key。
- 迁移失败时按原错误反馈，不要手工改远端 schema 绕过。

## 参考

- CLI 参考：https://supabase.com/docs/reference/cli
- 子命令与 dry-run 支持以 `supabase <command> --help` 为准。
