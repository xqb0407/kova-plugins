# 在 Kova 中准备 dws

本插件携带钉钉官方 `dws` 同包发布的 16 个 `dingtalk-*` Skills（配套 CLI `1.0.64`）。

## 何时执行

用户要使用钉钉能力，但终端里找不到 `dws`、启动失败，或版本不支持所需命令时执行。
先检查：

```bash
command -v dws && dws --version
```

已经可用就复用，不要重复安装。

## 安装

推荐 npm：

```bash
npm install -g dingtalk-workspace-cli
dws --version
```

其他方式：

```bash
# macOS / Linux 安装脚本
curl -fsSL https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install.sh | sh

# Homebrew
brew tap DingTalk-Real-AI/dingtalk-workspace-cli https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli.git
brew install dingtalk-workspace-cli
```

国内网络可使用官方 README 中的 Gitee 镜像或 npmmirror registry。

## 登录

```bash
dws auth login      # 浏览器授权；--device 用于 SSH / 无头环境
dws auth status
dws auth logout
```

- 首次登录需要企业管理员开通 CLI 访问；未开通时按 CLI 提示申请。
- 国际版 / 海外版使用 `dws auth login --intl`。
- 不要索要或输出 appSecret、access token、refresh token、webhook token，也不要代填账号密码。

## 版本与命令不一致

```bash
dws <path> --help
dws schema "<path>" --compact
```

插件内文档与 CLI 冲突时，以实际 CLI 的 Help / Schema 为准。
