# phone 插件（Android / ADB 手机控制）

让 agent 在一台 Android 设备（真机 USB/无线 ADB，或模拟器 AVD）上完成
「看界面 → 操作 → 验证」的闭环：截图拿视觉上下文、uiautomator 控件树拿稳定定位、
点击/长按/滑动/输入/按键/启动应用，每步操作后可截图或 `wait_for` 验证。
用于移动端 QA、App 操作自动化、跨端流程验证。

形态：**技能 + MCP**，无面板。与 `rea` 同构：MCP 服务器是手写 stdio JSON-RPC
（`mcp/server.ts`），由 Kova 内置运行时拉起（`${BUN}` + `BUN_BE_BUN=1`），
用户机器不用装 node/bun；**adb 由用户自装**（Android Platform Tools），插件不打包二进制。

## 前置

1. 安装 Android Platform Tools：macOS `brew install android-platform-tools`，其它平台从
   developer.android.com 下载 platform-tools 加入 PATH（或设 `ADB_PATH` 环境变量）；
2. 手机开「开发者选项 → USB 调试」，连接后在弹窗里允许本机调试；
3. 无线调试可选：终端里 `adb pair <ip:port>` + `adb connect <ip:port>`（插件不管配对）；
4. 中文输入可选：安装 [ADBKeyboard](https://github.com/senzhk/ADBKeyBoard)（缺失时工具报安装指引，不静默丢字）。

设备选择规则：显式 `serial` 必须存在且 state=device；不给 serial 时**恰好一台**在线才自动选，
0 台或多台都报错列出设备，绝不猜一台去点。

## 安装

插件仓库根部的 `marketplace.json` 已包含本插件。Kova → 插件页 → 添加市场（类型「目录」，
路径指向本仓库）→ 安装 phone（开发时选「链接安装 · 开发」，改文件不用重装）。

## MCP 工具（13 个）

调用经 Kova 的 `mcp` 网关：`mcp({ action: "call", tool: "phone__<工具名>", args: "{…}" })`。

动作类工具（tap / long_press / swipe / text / key / open_app）都支持 **`observe`** 参数
（`none`/`tree`/`screenshot`/`both`，缺省 none）：动作后随带取回新控件树/截图，一次调用
同时拿到「动作结果 + 新界面」，比单独再调 ui/screenshot 少一个来回。

### `status` / `doctor` — 总览与自检

`status`：adb 路径/版本、在线设备列表、选中设备的型号 / Android 版本 / 屏幕尺寸 / 前台应用 / 输入法、
ADBKeyboard 是否已装且激活。参数：`serial?`。
`doctor`（首次操作先跑）：adb → 设备在线 → 选中设备 → 屏幕尺寸 → uiautomator dump 逐项自检，
每项给通过/失败与修复建议，汇总 `ready` 布尔与设备信息；`ready=false` 时按 hint 修复，不要盲试其它工具。

### `screenshot` — 截图

`exec-out screencap -p`，默认缩到最长边 1400px（宿主单图上限 2MiB），返回 image 块 + 元信息。
参数：`serial?`、`maxSide?`（200–4000）、`savePath?`（相对工作区或绝对路径，落盘返回路径）、
`inline?`（false 时必须配 savePath，只落盘不内嵌）。

### `ui` — 控件树

`uiautomator dump`（动画期失败自动重试一次）→ 紧凑行输出，只留有文本/描述/id 或可交互的节点：
`#8 text="登录" id=com.app:id/login center=(540,1600) clickable`。
按 6.5KB 字节预算 + limit（默认 80）双保险截断，稳在宿主 8KB/1000 行上限内。
参数：`serial?`、`find?`（text/desc/id 子串）、`clickableOnly?`、`limit?`。

### `tap` / `long_press` — 点按

**选择器优先**：给 `text`/`desc`/`id`（子串、AND 关系）时内部 dump → 匹配 → 取中心点再操作，
返回命中节点；**0 个命中报错**；**多命中报候选列表（#0/#1/…），带 `matchIndex`（0 起）重选**，不猜。
坐标兜底 `x,y`（越界拦截，横竖屏任一方向装得下即放行）。
`long_press` 用零位移 swipe 实现，`durationMs` 缺省 1000。

### `swipe` — 滑动

`x1,y1,x2,y2` 必填；不带 `durationMs` 是快速轻扫（flick），带是拖拽。

### `scroll_find` — 滚动查找（v0.2）

边滑边找：从当前界面按 `direction`（手指移动方向，缺省 up）滑动，每滑一次重新 dump 匹配，
找到即停返回控件；`maxSwipes` 缺省 6、`distance` 缺省 0.6 屏。找列表深处的元素首选它，
不要手写「滑一下再看」循环。多命中规则同 tap（matchIndex 消歧）。

### `text` — 输入文本

ASCII 直接 `input text`（整段单引号包裹，POSIX 转义）；非 ASCII 走 ADBKeyboard 的
`ADB_INPUT_B64` 广播——没装报安装指引，装了没激活自动 `ime set`（失败即报错）并在结果里告知。
`submit?` 输完补回车，`method?` 可强制 `auto`/`ascii`/`adbkeyboard`。
带 `observe:"tree"` 时回读焦点框内容，结果给 `verified` 布尔；`verified:false` 表示没回读到输入内容
（可能被拦截/页面已跳转），按提示先观察，**不要盲目重发**。

### `key` — 系统键

`key` 支持按键名（back/home/enter/del/tab/esc/volume_up/volume_down/power/recents/dpad_*/
page_up/page_down/media_* 等）或数字 keycode。

### `open_app` / `apps` — 应用

`open_app`：只给 `package` 经 launcher intent（monkey）启动；给 `activity` 走 `am start -n`；
`stop?` 先 force-stop。启动后查前台包名确认成败。包名/Activity 过字符白名单校验（防设备侧注入）。
`apps`：列第三方包名（`includeSystem?` 连系统应用），`filter?` 子串过滤。

### `wait_for` — 等待验证

按 `text`/`desc`/`id` 轮询控件树直到命中或超时（`timeoutMs?` 缺省 10s、`intervalMs?` 缺省 1.2s）。
超时返回 `found:false` + 排查建议（弹窗/锁屏/文案不一致），不报错，方便 agent 分支处理。

## 技能

`skills/phone/SKILL.md`：触发词、mcp 网关调用三步、前置检查、
「看 → 操作 → 验证」工作流、选择器优先规则、**安全硬规则**（敏感操作先复述征得同意、
不越权、坐标有据、失败即停）、工具速查与故障排查。

## 设计取舍

- **参考 MiniMax phone-use（v0.2）**：observe 内嵌观察、scroll_find、matchIndex 消歧、
  doctor/ready 自检、「uncertain 不重放」规则借鉴自它的 android_use 设计；
  架构分叉保留我们自己的路线——纯 adb + uiautomator dump 零安装，不在手机上装 Portal APK，
  实时画面面板留待 v2（DESIGN.md §8）。
- **不做 shell 工具**：避免模型用 `adb shell` 绕过能力边界；需要的信息用专门工具取。
- **不装 APK**：v1 不引入「装未知应用」的风险面（ADBKeyboard 例外，且由用户手动装）。
- **PNG 零依赖处理**：`lib/image.ts` 手写解码（8-bit、色型 0/2/4/6，覆盖 screencap
  产出）+ 盒子平均缩放 + 重编码；其它形态原样透传给宿主归一化。
- **文本输出预算**：UI 树紧凑行 + 字节预算截断，序列化后稳在宿主 8KB/1000 行上限内。
- **iOS / 云手机 / 实时镜像面板**：见 DESIGN.md §8，列为后续方向（iOS 需 WDA/Appium，
  镜像面板需宿主新增「面板 ↔ MCP」通道）。

## 限制

- macOS 的 dump/截图依赖设备侧服务，老 Android（<4.3）或深度定制 ROM 可能不可用；
- 部分应用禁止截屏（FLAG_SECURE），截图全黑，只能走控件树；
- 广播输入可能被个别输入框拦截，输入后要验证；
- 每步 dump 约 0.5–1s，批量操作建议合并滑动/按键减少轮次。

## 验证

```bash
# 端到端（假 adb shim，覆盖 0/1/2 台设备、未授权、无 ADBKeyboard、输入法切换与失败、
# 命令构造、PNG 缩放落盘、选择器 0/多命中、matchIndex、observe 三种模式、
# scroll_find 滑动命中/超次、doctor 就绪/失败等 89 项断言）
node plugins/phone/mcp/test/run-tests.mjs

# 起 MCP server 手动把玩（stdout 是协议行，日志在 stderr）
cd plugins/phone && /Applications/Kova.app/Contents/Resources/binaries/kova-worker run mcp/server.ts

# 插件仓库自检（清单/市场条目/组件路径）
node scripts/check.mjs
```

真机 checklist（未跑，需要设备）：截图、UI 树、按文本点击、中英文输入、启动应用、
等待、旋转屏幕、锁屏状态、无线调试、多设备选择。
