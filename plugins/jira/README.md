# Jira 插件

用 Atlassian 官方 CLI 检索和更新 Jira work item、执行 JQL、查看 sprint 与字段。插件只包含技能，负责安装、授权与命令发现，不包含 MCP 服务器、HTTP 客户端或凭据。

## 安装

```bash
brew tap atlassian/homebrew-acli
brew install acli
acli --version
```

## 授权

```bash
acli jira auth login --web
acli jira auth status
```

也可用 `--site --email --token`，token 从 stdin 读取。

## 常用命令

```bash
acli jira workitem search --jql "project = TEAM" --json
acli jira workitem view KEY-123 --json
acli jira workitem create --project TEAM --type Task --summary "..." --json
acli jira workitem transition --key KEY-123 --status "In Progress"
```

## 内置技能

`jira` —— JQL、work item、sprint、board 与状态流转

## 安全约定

- 删除、归档、批量创建与批量流转前必须获得用户明确同意。
- `--yes` 跳过确认，`--ignore-errors` 掩盖失败，不要默认使用。
- 不输出 token。

## 来源与许可

- 上游：https://developer.atlassian.com/cloud/acli/
- 许可：闭源免费工具，以 Atlassian 条款为准
