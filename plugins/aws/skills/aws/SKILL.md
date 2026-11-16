---
name: aws
description: "用 AWS 官方 MCP Server 查询文档、区域可用性并在沙箱中运行 AWS API 脚本。用户提到 AWS、IAM、S3、Lambda、CloudWatch、区域、配额、AWS 文档时使用。写操作和高风险 API 调用前必须确认；优先只读查询。"
---

# AWS 官方 MCP

本技能随 Kova 的 `aws` 插件分发。插件连接 AWS 官方 MCP Server，技能负责授权与安全边界。

## 连接与授权

- 端点：`https://aws-mcp.us-east-1.api.aws/mcp`
- 其他区域：`us-west-2`、`ap-southeast-1`、`ap-southeast-2`、`ap-northeast-1`、`eu-west-1`、`eu-west-2`、`eu-central-1`。
- 授权：OAuth 2.1（AWS Sign-in），需要授权 `AWSMCPSignInOAuthAccessPolicy`。
- 也可以使用 SigV4 + `mcp-proxy-for-aws`（uvx）走本地 stdio。
- 无账户的文档查询可用 AWS Knowledge MCP；本插件默认连接需要授权的 AWS MCP Server。

## 可用工具

| 工具 | 用途 |
|---|---|
| `aws___search_documentation` | 搜索 AWS 文档 |
| `aws___read_documentation` | 读取文档页面 |
| `aws___list_regions` | 列出区域 |
| `aws___get_regional_availability` | 查询服务/功能在区域的可用性 |
| `aws___run_script` | 在沙箱中运行 Python 调用 AWS API |
| `aws___retrieve_skill` | 读取 AWS 预置技能 |

## 使用顺序

1. 先查文档与区域可用性，确认 API、区域和限制。
2. 只读查询优先：`describe`、`list`、`get` 类 API。
3. 需要写操作时先展示账号、区域、资源 ARN、变更内容和回滚方式。
4. 执行后复查资源状态，保留关键输出。

## 安全约定

- `aws___run_script` 会在带 AWS 凭证的沙箱中执行任意 Python；视为高权限操作。
- 创建、修改、删除资源，改 IAM 策略，动 S3 数据，触发部署前必须获得明确同意。
- 遵循最小权限；不要使用管理员凭证做只读查询。
- 不输出 access key、secret key、session token 或账户 ID。
- 生产账号操作前确认 `AWS_PROFILE` / `AWS_REGION` 与目标账号一致。

## 参考

- 文档：https://docs.aws.amazon.com/agent-toolkit/latest/userguide/getting-started-aws-mcp-server.html
- Knowledge MCP：https://knowledge-mcp.global.api.aws
