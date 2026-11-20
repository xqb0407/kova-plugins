# vendored 运行时依赖（ui-design MCP）

插件市场安装是**原样拷贝、不跑 bun install**，而 `node_modules/` 不入库——MCP
server 不能依赖插件根 node_modules 才能启动。这里放随包分发的运行时材料：

| 文件 | 来源 | 许可证 |
|---|---|---|
| `resvg-index_bg.wasm` | `@resvg/resvg-wasm@2.6.2` 的 `index_bg.wasm`（原样复制，未修改） | MPL-2.0 — https://github.com/thx/resvg-js |

`@resvg/resvg-wasm`（MPL-2.0，文件级弱 copyleft）与 `polygon-clipping`（MIT）的
JS 胶水由 `mcp/server.bundle.js` 内联分发（bun build 产物，见 package.json 的
`build:mcp`）。MPL-2.0 许可证文本：https://www.mozilla.org/en-US/MPL/2.0/
