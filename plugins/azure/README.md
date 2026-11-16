# Azure 插件

通过 Microsoft 官方 Azure MCP Server 查询订阅、资源组、存储、Key Vault、Monitor、Cosmos/SQL 与 AKS。插件包含官方 MCP 配置与技能，技能负责授权、连接检查、工具选择与安全约定。

## 安装

无需单独安装 MCP，插件用 `${BUN} x @azure/mcp@latest server start` 启动；需要 Azure CLI。

## 授权

```bash
az login
az account show
```

## 常用场景

```text
列出当前订阅的资源组
查询 Storage 账户与容器
读取 Key Vault 中的某个 secret
查询 Azure Monitor 日志
```

## 内置技能

`azure` —— 订阅、资源、Storage、Key Vault、Monitor 与 AKS

## 安全约定

- 读取密钥明文和任何写操作前必须确认。
- 遵循最小权限，不输出客户端密钥。
- 操作前确认订阅与资源组。

## 来源与许可

- 上游：https://learn.microsoft.com/azure/developer/azure-mcp-server/
- 许可：MIT
