# AWS 插件

通过 AWS 官方 MCP Server 查询文档、区域可用性，并在沙箱中运行 Python 调用 AWS API。插件包含官方 MCP 配置与技能，技能负责授权、连接检查、工具选择与安全约定。

## 安装

无需本地安装。插件自带远程 MCP 配置；也可用 SigV4 + `mcp-proxy-for-aws` 走 stdio。

## 授权

OAuth 2.1（AWS Sign-in），需授权 `AWSMCPSignInOAuthAccessPolicy`。

## 常用场景

```text
查 S3 某功能在哪些区域可用
搜索 Lambda 冷启动的最新文档
列出当前区域的资源
用只读 API 排查配置
```

## 内置技能

`aws` —— 文档、区域可用性与 AWS API 脚本

## 安全约定

- run_script 是高权限操作，写操作前必须确认。
- 遵循最小权限，不输出密钥。
- 操作前确认账号与区域。

## 来源与许可

- 上游：https://docs.aws.amazon.com/agent-toolkit/latest/userguide/getting-started-aws-mcp-server.html
- 许可：AWS 官方服务条款
