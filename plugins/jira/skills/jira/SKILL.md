---
name: jira
description: "用 Atlassian 官方 acli 处理 Jira 工作流：JQL 检索 work item、查看详情与评论、创建和编辑、流转状态、查看 sprint/board/字段。用户提到 Jira、acli、work item、JQL、sprint、看板、工单流转时使用。写操作与批量流转必须先获得用户确认。"
---

# Jira（acli）工作流

本技能随 Kova 的 `jira` 插件分发，封装 Atlassian 官方 `acli`。安装、登录由技能指导；插件不内置 HTTP 客户端，不保存 token。

## 前置检查

1. 检查版本：`acli --version`
2. 未安装时：

```bash
brew tap atlassian/homebrew-acli
brew install acli
```

其他平台见 https://developer.atlassian.com/cloud/acli/。

3. 登录：`acli jira auth login --web`；也可用 `--site --email --token`（token 从 stdin 读取）。
4. 检查状态：`acli jira auth status`。
5. 注意：当前 `acli` 只覆盖 Jira，不覆盖 Confluence。Confluence 相关请求改用 Atlassian 的 `twg`（Teamwork Graph CLI）或网页端，不要伪造 `acli` 子命令。

## 常用命令

```bash
# 站点与项目
acli jira project list --json

# JQL 检索
acli jira workitem search --jql "project = TEAM AND status != Done" \
  --fields key,summary,status,assignee --limit 50 --json

# 详情
acli jira workitem view KEY-123 --fields summary,description,comment --json

# 创建与编辑
acli jira workitem create --project TEAM --type Task \
  --summary "..." --description "..." --json
acli jira workitem edit --key KEY-123 --summary "..." --json

# 状态流转
acli jira workitem transition --key KEY-123 --status "In Progress"
acli jira workitem transition --jql "project = TEAM" --status "In Progress"

# Sprint 与字段
acli jira sprint list-workitems --board <board-id> --sprint <sprint-id> --json
acli jira board list-sprints --board <board-id> --json
acli jira field list --json
```

评论、附件、关注、链接等子命令先执行 `acli jira workitem --help` 发现，不要猜参数。

## 输出与脚本

- 优先加 `--json`；需要表格时用 `--csv`。
- JQL 中的项目、状态、负责人先用只读检索确认，避免全量误更新。
- 判断成功以退出码为准。

## 安全约定

- 执行写操作前先展示项目、issue key、目标状态和影响范围。
- `workitem delete`、`archive`、`create-bulk`、`transition` 属于高风险操作，必须获得用户明确同意。
- `--yes` 会跳过确认，`--ignore-errors` 会掩盖失败，非用户明确要求不要使用。
- 不输出 token；不把 `--token` 明文写进命令历史或日志。
- 批量流转前先跑同样的 JQL 只读检索，确认命中条数。

## 参考

- ACLI：https://developer.atlassian.com/cloud/acli/
- TWG CLI：https://developer.atlassian.com/cloud/twg-cli/
- 子命令与 flag 以 `acli <path> --help` 为准。
