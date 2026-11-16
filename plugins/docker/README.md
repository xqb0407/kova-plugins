# Docker 插件

用官方 Docker CLI 构建镜像、管理 Compose 服务、查看日志与配置、清理资源。插件只包含技能，负责安装、授权与命令发现，不包含 MCP 服务器、HTTP 客户端或凭据。

## 安装

安装 Docker Desktop（macOS）或 Docker Engine；CLI 随附。

```bash
docker --version
docker compose version
```

## 授权

```bash
docker login
```

凭据存 `~/.docker/config.json` 或系统 credsStore。

## 常用命令

```bash
docker compose up -d --build --wait
docker compose ps
docker compose logs -f <service>
docker compose exec <service> sh
```

## 内置技能

`docker` —— Compose、镜像构建、容器排查与资源清理

## 安全约定

- 删除卷、prune、system prune 前必须确认。
- push 前确认镜像名、tag 与 registry。
- 不输出 registry 密码。

## 来源与许可

- 上游：https://docs.docker.com/reference/cli/docker/
- 许可：Apache-2.0（Docker Desktop 为商业订阅）
