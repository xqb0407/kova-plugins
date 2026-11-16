---
name: github
description: "用官方 gh CLI 处理 GitHub 工作流：查看仓库、检索与创建 issue、查看 PR 详情与 diff、检查 CI 状态、读取 Actions 失败日志、搜索代码、管理 release。用户提到 GitHub、gh、PR、pull request、issue、Actions、review、release 时使用。只读优先，合并、删除、发版等写操作必须先获得用户确认。"
---

# GitHub CLI 工作流

本技能随 Kova 的 `github` 插件分发，只封装官方 `gh` CLI。安装、登录由技能指导；插件不内置 HTTP 客户端，不保存 token。

## MCP 与 CLI 的分工

本插件同时提供官方 GitHub MCP（远程 HTTP，OAuth 或 PAT）：`https://api.githubcopilot.com/mcp/`。

- 结构化读取（issue、PR、评审、代码搜索）优先用 MCP 工具；
- Actions 失败日志、release、分页聚合与任意 REST 调用继续用 `gh`；
- MCP 与 CLI 使用同一账号权限，写操作前同样先读取确认目标。

## 前置检查

1. 检查版本：`gh --version`
2. 未安装时按平台安装：

```bash
# macOS
brew install gh
# Windows
winget install --id GitHub.cli
# Debian / Ubuntu
sudo apt install gh
```

3. 检查登录：`gh auth status`；未登录时执行 `gh auth login`（浏览器或 token）。
4. CI / 无人值守环境使用 `GH_TOKEN` 或 `GH_ENTERPRISE_TOKEN`，不要写入仓库文件。
5. 多账号用 `gh auth switch` 切换，操作前先确认当前账号与 `--hostname`。

## 常用命令

```bash
# 仓库
gh repo view owner/repo --json name,description,defaultBranchRef

# issue
gh issue list -R owner/repo --state open --label bug --json number,title,author
gh issue view 123 -R owner/repo --comments
gh issue create -R owner/repo --title "Bug: ..." --body "..." --label bug

# pull request
gh pr list --state open --json number,title,reviewDecision,statusCheckRollup
gh pr view 123 --json title,body,files,reviews,statusCheckRollup
gh pr diff 123
gh pr checks 123
gh pr create --base main --title "..." --body "..." --draft

# Actions
gh run list --branch main --limit 20 --json databaseId,workflowName,conclusion
gh run view <run-id> --log-failed
gh run watch <run-id>

# 搜索与 API
gh search code "panic" --language go --json path,url
gh api repos/owner/repo/issues --paginate --jq '.[].number'
gh release list --limit 10
```

## 输出与脚本

- 列表和详情优先用 `--json <fields>` 配合 `--jq`，不要解析人类可读表格。
- `gh api` 返回原生 JSON；跨页结果加 `--paginate`。
- 判断成功以退出码为准；失败时原样保留 stderr 关键信息。

## 安全约定

- 执行前先用只读命令确认仓库、分支、PR 编号与当前账号。
- `gh pr merge`、`gh repo delete`、`gh release delete`、`gh api -X DELETE` 属于高风险写操作，必须先向用户展示目标并获得明确同意。
- 不输出 `GH_TOKEN`、`GH_ENTERPRISE_TOKEN` 或任何 Authorization 头。
- 写操作失败时按原错误反馈，不换命令绕过。

## 参考

- 手册：https://cli.github.com/manual/
- 版本以 `gh --version` 为准；字段名以对应子命令 `--help` 为准。
