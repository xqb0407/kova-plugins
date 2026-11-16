# 在 Kova 中准备 lark-cli

本插件携带飞书官方 `lark-cli` 的全套 25 个 `lark-*` Skills（上游 `larksuite/cli`，配套 CLI `1.0.100`）。
业务命令、身份与授权以飞书官方 reference 为准。

## 何时执行

用户要使用飞书能力，但终端里找不到 `lark-cli`、可执行程序启动失败，或版本不支持所需命令时执行。
先检查：

```bash
command -v lark-cli && lark-cli --version
```

已经可用就复用，不要重复安装。

## 安装

需要 Node.js：

```bash
npm install -g @larksuite/cli@1.0.100
lark-cli --version
```

官方安装器 `npx @larksuite/cli@latest install` 会同时安装全局 Skills；本插件已经自带 Skills，
不要运行它，也不要执行 `npx skills add`。

没有 Node/npm 时，从官方 Release 下载对应平台的独立二进制并校验 SHA-256。建议装到
`~/.kova/bin`，把该目录加入 PATH，或在后续命令中直接使用绝对路径。不要仅为准备 CLI
要求用户安装 Node，也不要自动提权。

安装后若当前 PATH 找不到命令，用 `npm prefix -g` 找到全局前缀：
macOS/Linux 入口是 `<prefix>/bin/lark-cli`，Windows 是 `<prefix>/lark-cli.cmd`。

## 授权

```bash
lark-cli auth status
lark-cli auth login --recommend           # 推荐权限集
lark-cli auth login --domain im,contact   # 只授权指定域
```

无头环境：

```bash
lark-cli auth login --domain im --no-wait
lark-cli auth login --device-code <CODE>
```

授权必须由用户在浏览器或设备上完成。不要索要或输出 appSecret、access token，也不要代填。
飞书与 Lark 国际版共用同一 CLI，登录时选择对应租户。

## Windows

PowerShell 中 npm 安装的入口用 `lark-cli.cmd`，独立二进制用 `.exe`，避免无扩展名调用
选中 `.ps1` 被执行策略拦截。

## 版本不一致

以 `lark-cli skills read <skill>` 和具体命令的 `--help` 为准；插件内文档与 CLI 冲突时以 CLI 为准。
