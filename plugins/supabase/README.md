# Supabase 插件

用官方 Supabase CLI 管理本地栈、数据库迁移、类型生成、secrets 与 Edge Functions。插件同时提供技能与官方 MCP 配置：CLI 负责本地栈、迁移、类型生成与函数部署，MCP 提供面向 agent 的数据库查询与项目信息工具；不内置 HTTP 客户端，也不保存凭据。

## 安装

```bash
brew install supabase/tap/supabase
# 或 npm i supabase --save-dev
supabase --version
```

## 授权

```bash
supabase login
supabase link --project-ref <ref>
```

CI 使用 `SUPABASE_ACCESS_TOKEN`，数据库口令用 `SUPABASE_DB_PASSWORD`。

## 常用命令

```bash
supabase start
supabase migration new add_users
supabase db push
supabase gen types typescript --local
supabase functions deploy hello
```

## MCP 服务器

插件附带 Supabase 官方远程 MCP（默认只读）：`https://mcp.supabase.com/mcp?read_only=true`（OAuth）

- 默认只读，适合查看表结构、执行查询与排查数据；需要写入时自行去掉 `read_only=true`，并确认项目与 SQL 影响范围。
- 本地栈、迁移、类型生成与 Edge Functions 部署仍走 `supabase` CLI。
- 生产项目避免直接执行 DDL 或批量更新。

## 内置技能

`supabase` —— 本地栈、迁移、类型、secrets 与 Edge Functions

## 安全约定

- db push/reset、secrets 变更、函数部署前确认项目与环境。
- db reset 会清空数据，不要对远端项目使用。
- 不输出 access token、数据库口令或 service role key。

## 来源与许可

- 上游：https://supabase.com/docs/reference/cli
- 许可：MIT
