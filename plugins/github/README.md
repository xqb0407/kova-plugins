# GitHub 插件

用官方 GitHub CLI 覆盖仓库、issue、PR、Actions、release 与代码搜索。插件同时提供技能与官方 MCP 配置：CLI 负责安装、授权与命令执行，MCP 提供结构化的仓库、issue、PR 与代码搜索工具；不内置 HTTP 客户端，也不保存凭据。

## 安装

```bash
brew install gh          # macOS
winget install --id GitHub.cli   # Windows
sudo apt install gh      # Debian / Ubuntu
gh --version
```

## 授权

```bash
gh auth login
gh auth status
```

CI 环境使用 `GH_TOKEN`，不要写入仓库。

## 常用命令

```bash
gh pr list --state open --json number,title
gh pr view 123 --json title,reviews,statusCheckRollup
gh run list --limit 20 --json databaseId,conclusion
gh run view <run-id> --log-failed
```

## MCP 服务器

插件附带官方 GitHub MCP（远程 HTTP）：`https://api.githubcopilot.com/mcp/`

- 首次连接按提示完成 OAuth；无浏览器环境可用 PAT（`Authorization: Bearer <token>`）。
- MCP 适合结构化读取 issue、PR、评审与代码搜索；Actions 失败日志、release、`gh api` 仍走 CLI。
- 合并 PR、评论、改 issue、删分支等写操作，先用 MCP 或 CLI 读取确认目标仓库与编号。

## 内置技能

`github` —— 仓库、issue、PR、Actions、release 与代码搜索

## 安全约定

- 合并、删除仓库、删除 release、`gh api -X DELETE` 前必须获得用户明确同意。
- 不输出 token 或 Authorization 头。
- 列表与详情优先用 `--json` + `--jq`。

## 来源与许可

- 上游：https://github.com/cli/cli
- 许可：MIT
