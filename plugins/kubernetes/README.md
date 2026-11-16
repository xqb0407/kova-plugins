# Kubernetes 插件

用官方 kubectl 查询集群资源、排查 Pod、读取日志、diff/apply 清单与回滚 Deployment。插件只包含技能，负责安装、授权与命令发现，不包含 MCP 服务器、HTTP 客户端或凭据。

## 安装

```bash
brew install kubectl
kubectl version --client
```

## 授权

使用现有 kubeconfig（`~/.kube/config`）：

```bash
kubectl config get-contexts
kubectl config use-context <ctx>
```

## 常用命令

```bash
kubectl get pods -A
kubectl describe pod <name>
kubectl logs -f deploy/<name>
kubectl diff -f k8s/
kubectl apply -f k8s/
```

## 内置技能

`kubernetes` —— 集群查询、Pod 排查、日志、apply 与回滚

## 安全约定

- 写操作前确认 context、namespace 与资源名。
- 生产集群避免直接 delete -f。
- 不输出 kubeconfig、token 或 secret 内容。

## 来源与许可

- 上游：https://kubernetes.io/docs/reference/kubectl/
- 许可：Apache-2.0
