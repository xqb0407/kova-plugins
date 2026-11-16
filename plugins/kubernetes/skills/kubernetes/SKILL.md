---
name: kubernetes
description: "用官方 kubectl 处理 Kubernetes 工作流：切换 context、查询 Pod/Deployment/Service、查看事件与 describe、读取日志、进入容器、diff 和 apply 清单、查看 rollout 与回滚。用户提到 Kubernetes、kubectl、k8s、Pod、Deployment、集群、发布回滚时使用。apply/delete/patch/rollback 前必须确认 context 与 namespace。"
---

# Kubernetes（kubectl）工作流

本技能随 Kova 的 `kubernetes` 插件分发，封装官方 `kubectl`。插件不保存 kubeconfig 或 token。

## 前置检查

1. 检查版本：`kubectl version --client`
2. 未安装时：`brew install kubectl`，或按 https://kubernetes.io/docs/tasks/tools/ 安装。
3. 查看当前 context：`kubectl config current-context`。
4. 列出可用集群：`kubectl config get-contexts`；切换用 `kubectl config use-context <ctx>`。
5. 多集群场景用 `KUBECONFIG` 或 `--context` / `--namespace` 显式指定。

## 常用命令

```bash
kubectl config get-contexts
kubectl config use-context <ctx>

# 查询
kubectl get pods -A -o wide
kubectl get deploy <name> -o json
kubectl get events --sort-by=.metadata.creationTimestamp
kubectl describe pod <name>

# 日志与进入容器
kubectl logs -f deploy/<name>
kubectl logs <pod> -c <container> --previous
kubectl exec -it <pod> -- sh

# 发布
kubectl diff -f k8s/
kubectl apply -f k8s/ --dry-run=server
kubectl apply -f k8s/
kubectl rollout status -w deploy/<name>
kubectl rollout undo deploy/<name>

# 删除
kubectl delete -f k8s/
```

## 输出与脚本

- 用 `-o json` / `-o yaml` / `-o jsonpath` 获取结构化结果。
- 先 `kubectl diff` 或 `--dry-run=server` 预览变更，再 apply。
- 判断成功以退出码为准；资源不存在时区分 NotFound 与权限错误。

## 安全约定

- 执行写操作前必须展示当前 context、namespace、资源名和变更摘要，并获得用户明确同意。
- `apply`、`delete`、`patch`、`replace --force`、`rollout undo` 属于高风险操作。
- 不在生产 context 上直接执行 `delete -f`；先确认是否选错集群。
- 不输出 kubeconfig、token 或 secret 的 base64 内容。
- 不确定时先用只读命令排查，不要用 `--force` 跳过问题。

## 参考

- kubectl：https://kubernetes.io/docs/reference/kubectl/
- 子命令以 `kubectl <command> --help` 为准。
