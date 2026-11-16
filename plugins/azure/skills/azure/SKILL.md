---
name: azure
description: "用 Microsoft 官方 Azure MCP Server 查询订阅、资源组、存储、Key Vault、Monitor、Cosmos/SQL 与 AKS 等资源。用户提到 Azure、az login、订阅、资源组、Key Vault、AKS、Azure Monitor 时使用。读取密钥和任何写操作前必须确认；先完成 az login。"
---

# Azure 官方 MCP

本技能随 Kova 的 `azure` 插件分发。插件通过 stdio 启动 Microsoft 官方 `@azure/mcp`。

## 前置检查

1. 安装 Azure CLI：`brew install azure-cli`。
2. 登录：`az login`；多租户时加 `--tenant`。
3. 确认订阅：`az account show`；必要时 `az account set --subscription <id>`。
4. MCP 按环境变量 → VS Code → Visual Studio → Azure CLI / PowerShell / azd 的顺序读取凭证。
5. 可在 Kova 的 MCP 设置中追加 `--subscription` 或 `--tenant`。

## 可用工具

工具以 `azmcp_*` 命名，按产品分组：

| 领域 | 示例工具 |
|---|---|
| 资源组 / 订阅 | `azmcp_subscription_list`、`azmcp_group_list` |
| Storage | `azmcp_storage_account_get`、`azmcp_storage_blob_list` |
| Key Vault | `azmcp_keyvault_secret_get` |
| Monitor | `azmcp_monitor_log_query` |
| Cosmos DB / SQL | `azmcp_cosmos_*`、`azmcp_sql_*` |
| AKS | `azmcp_aks_*` |

具体工具名以运行时 `tools/list` 为准。

## 使用顺序

1. 先 `az account show` 确认订阅与租户。
2. 用只读工具列出资源，确认资源组、名称和区域。
3. 读 Key Vault 密钥、连接字符串或账户密钥前，说明用途并获得同意。
4. 写操作前展示资源 ID、变更内容和回滚方式。
5. 执行后复查状态。

## 安全约定

- `azmcp_keyvault_secret_get` 会暴露密钥明文；只在用户明确要求时调用，不写入日志。
- 创建、修改、删除资源，改 RBAC，重启服务前必须获得明确同意。
- 遵循最小权限；不要用 Owner 订阅做日常只读查询。
- 不输出 `AZURE_CLIENT_SECRET`、`AZURE_CLIENT_ID` 或 access token。
- 操作前确认订阅、租户与资源组，避免误动生产。

## 参考

- 文档：https://learn.microsoft.com/azure/developer/azure-mcp-server/
- 工具：https://learn.microsoft.com/azure/developer/azure-mcp-server/tools/
