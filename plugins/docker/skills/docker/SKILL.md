---
name: docker
description: "用官方 docker 与 docker compose CLI 处理容器工作流：构建镜像、启动和停止 Compose 栈、查看服务与日志、进入容器执行命令、检查容器配置、清理镜像和卷。用户提到 Docker、docker compose、容器、镜像、Compose、日志、端口冲突时使用。删除卷、清理资源、推送镜像前必须确认。"
---

# Docker CLI 工作流

本技能随 Kova 的 `docker` 插件分发，封装官方 `docker` / `docker compose`。插件不保存凭据。

## 前置检查

1. 检查 daemon：`docker info`
2. 检查版本：`docker --version`、`docker compose version`
3. macOS 需要 Docker Desktop 或其他兼容 daemon；CLI 随 Desktop 安装。
4. 私有仓库登录：`docker login`；凭据存 `~/.docker/config.json` 或系统 credsStore。
5. 多 daemon 场景确认 `DOCKER_HOST` / `DOCKER_CONTEXT`。

## 常用命令

```bash
# Compose
docker compose up -d --build --wait
docker compose ps
docker compose logs -f <service>
docker compose exec <service> sh
docker compose down

# 镜像
docker build -t app:latest .
docker images

# 容器排查
docker ps
docker inspect <id>
docker stats --no-stream

# 清理
docker image prune -f
```

## 输出与脚本

- `docker inspect` 天然输出 JSON；需要字段时配合 `--format '{{json .}}'`。
- `docker compose --progress json` 适合脚本解析。
- 判断成功以退出码为准。

## 安全约定

- `docker compose down -v`、`docker volume rm`、`docker image prune`、`docker system prune` 会删除数据，执行前必须展示目标并获得明确同意。
- `docker push` 前确认镜像名、tag 与目标 registry。
- 不输出 registry 密码；不把 `DOCKER_AUTH_CONFIG` 写进仓库。
- 端口冲突时先只读排查 `docker ps`，不要直接删除未知容器。

## 参考

- CLI：https://docs.docker.com/reference/cli/docker/
- Compose：https://docs.docker.com/compose/
- 子命令以 `docker <command> --help` 为准。
