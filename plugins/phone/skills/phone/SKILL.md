---
name: phone
description: 操作 Android 手机/模拟器（ADB）——截图看界面、读控件树、点击/长按/滑动、滚动查找列表元素、输入中英文、按键、启动应用、等待界面变化、就绪自检，形成「看 → 操作 → 验证」闭环；动作可带 observe 一步取回新界面。当用户说「操作我的手机」「在手机上点…」「帮我打开某个 App」「移动端回归/QA」「在模拟器里验证一下」时使用。需要本机安装 Android Platform Tools 并授权 USB 调试；只做用户授权范围内的操作，不破解、不越权。
---

# phone：Android 手机控制

一个 MCP 工具面（11 个工具）+ 一套「看 → 操作 → 验证」闭环。核心纪律：**每一步操作前后都要有截图/控件树证据**，不做盲操作。

## 边界（先读）

- 只在用户明确授权的设备上操作；敏感操作（支付/转账/删除、给他人发消息、修改账号设置）必须先复述将要点的元素并征得同意，再执行。
- 不 root、不绕锁屏/应用保护、不读隐私数据（通讯录/短信/相册）、不装未知 APK。锁屏时提示用户手动解锁，不猜密码。
- 没有提供 `adb shell` 工具——需要的信息用专门工具取；如果发现某个需求必须 shell 才能完成，说明并停在那里。

## 控制面：`mcp` 网关

本插件的 MCP 工具**不会作为独立工具**出现在工具表里——Kova 用常驻的 `mcp` 网关代理所有 MCP 工具。调用三步：

1. `mcp({ action: "search", query: "phone" })` → 拿全名（`phone__status` 等）；
2. `mcp({ action: "describe", tool: "phone__status" })` → 看参数 schema；
3. `mcp({ action: "call", tool: "phone__status", args: "{}" })` → 执行。

要点：

- 全名约定 `<server>__<tool>`，本插件 server 名是 `phone`：`phone__status`、`phone__doctor`、`phone__screenshot`、`phone__ui`、`phone__tap`、`phone__long_press`、`phone__swipe`、`phone__scroll_find`、`phone__text`、`phone__key`、`phone__open_app`、`phone__apps`、`phone__wait_for`；
- `args` 是 **JSON 对象的字符串**（不是对象字面量）；
- 连接是**懒的**：第一次 `call` 才建立。刚装好插件时 `search` 可能搜不到，直接按全名 `call`；`mcp({ action: "status" })` 可确认 `phone` 是否已配置/已连接。

## 前置检查

1. 首次操作一台设备先 `phone__doctor`：逐项检查 adb → 设备在线 → 选中设备 → 屏幕尺寸 → dump，`ready=false` 时按各项的 hint 修复后重跑，**不要盲试其它工具**。
2. adb 缺失 → macOS `brew install android-platform-tools`，其它平台下载 platform-tools 加 PATH（错误信息里有完整指引）。
3. 0 台/多台在线设备都会报错：0 台按提示连 USB 开 USB 调试；多台用 `serial` 参数指定（serial 从 doctor/status 的 devices 列表取）。

## 工作流（按顺序，别跳）

### 1. 看界面：`phone__screenshot` + `phone__ui`

每次操作前先截图拿视觉上下文，再 dump 控件树拿**稳定定位**：

```text
mcp({ action: "call", tool: "phone__ui", args: "{}" })
```

- 控件行格式：`#8 text="登录" id=com.app:id/login center=(540,1600) clickable`；
- `center` 就是可直接给 `tap` 的坐标；`find` 参数按 text/desc/id 子串过滤，先过滤再细看；
- 截图缩到最长边 1400px，要看大图细节时 `savePath` 落盘后用文件。

### 2. 操作：选择器优先，坐标兜底

- **优先选择器**：`phone__tap({ text: "登录" })` 内部 dump → 匹配 → 取中心点 → 点击，返回命中节点；
- **0 个或多个命中都直接报错**（防误触）：0 个 → 换更接近的文本/描述/id 或截图确认是否在弹窗/锁屏；多个 → 从报错的候选列表里**带 `matchIndex`（0 起）重选**，或换更精确的选择器；
- **坐标兜底**：纯弹窗/游戏画面没有控件时，坐标必须来自当前 `phone__ui` 的 center 或用户指定，**不要凭截图目测换算**（截图可能被缩放过）；
- 滑动：`phone__swipe` 不带 durationMs 是轻扫（flick），带 durationMs 是拖拽；长按 `phone__long_press`；
- **省回合技巧**：已知下一步时连续执行（缺省 `observe:"none"`）；要验证时给动作带 `observe:"tree"`（或 `"screenshot"`/`"both"`），一次拿回动作结果+新界面，省一整轮调用。

### 3. 验证：每步之后

- 界面有明确目标元素 → `phone__wait_for({ text: "目标文案" })`（轮询，比盲目等待省时）；
- **列表深处找元素 → `phone__scroll_find`**（边滑边找，不要手写「滑一下再看」循环）；
- 视觉验证 → 再 `phone__screenshot`，或直接在动作上带 `observe:"screenshot"`；
- 输入文本 → 带 `observe:"tree"` 回读焦点框，看结果的 `verified` 字段；
- `wait_for` 超时返回 `found: false` 时**不要原样重试**：先截图看是不是停在弹窗/锁屏/加载页。

### 4. 输入文本

- 输入框要先聚焦：不在输入框时先 tap 输入框；
- ASCII（英文/数字/常见符号）直接 `phone__text`；
- 中文等非 ASCII 走 ADBKeyboard：设备未安装时工具会报**安装指引**（不静默丢字），已安装未激活会自动切换并告知；
- 输入完成后用 `phone__ui` 或截图确认文本真的进了输入框。

### 5. 启动应用

- 包名未知 → `phone__apps({ filter: "关键词" })` 查；
- `phone__open_app({ package: "com.example.app" })` 后看返回的 `started`/`foreground`；没起来就截图排查（没装/崩溃/启动页）。

## 安全硬规则（不可跳过）

1. **复述再点**：执行支付、删除、发送、同意授权等不可逆操作前，先用一句话向用户复述将点击的元素与后果，得到明确同意。
2. **不重放**：结果报 `verified: false`、`uncertain` 或明确提示「可能已生效」时，动作可能已经进了设备——**禁止重放输入、发送、提交或支付**，先观察真实状态再决定。
3. **密码与锁屏交给用户**：焦点框是密码框（`password` 标记）、需要指纹/人脸/PIN/验证码，或设备锁屏时，停下请用户在手机上亲手完成并确认，不代填、不索取、不猜凭据。
4. **不越权**：遇到解锁、验证码、root、装 APK、读隐私数据（通讯录/短信/相册）的请求，说明边界并停手。
5. **坐标有据**：所有坐标来自 `phone__ui` 或用户指定；截图目测坐标一律不用。
6. **失败即停**：同一操作失败两次就停下汇报，不要循环重试（可能在弹窗里反复误触）。

## 工具速查

| 全名 | 用途 | 关键参数 |
| --- | --- | --- |
| `phone__doctor` | 就绪自检（首用先跑） | `serial?` |
| `phone__status` | 设备/屏幕/输入法总览 | `serial?` |
| `phone__screenshot` | 截图（内嵌 + 可落盘） | `maxSide?`, `savePath?`, `inline?` |
| `phone__ui` | 控件树（紧凑行） | `find?`, `clickableOnly?`, `limit?` |
| `phone__tap` | 点击（选择器或坐标） | `text/desc/id`, `matchIndex?` 或 `x,y`, `observe?` |
| `phone__long_press` | 长按 | 同 tap + `durationMs?` |
| `phone__swipe` | 滑动/拖拽 | `x1,y1,x2,y2`, `durationMs?`, `observe?` |
| `phone__scroll_find` | 边滑边找列表元素 | `text/desc/id`, `direction?`, `maxSwipes?` |
| `phone__text` | 输入文本（中文走 ADBKeyboard） | `text`, `submit?`, `method?`, `observe?` |
| `phone__key` | 系统键/keycode | `key`（back/home/enter/…）, `observe?` |
| `phone__open_app` | 启动/重启应用 | `package`, `activity?`, `stop?`, `observe?` |
| `phone__apps` | 列第三方应用包名 | `filter?`, `includeSystem?` |
| `phone__wait_for` | 轮询等元素出现 | `text/desc/id`, `timeoutMs?` |

## 故障排查

- **工具表里没有 `phone_*`**：正常——MCP 工具经 `mcp` 网关调用，全名是 `phone__status`；先 `mcp({ action: "status" })` 看服务器，再按全名 `call`。
- **「找不到 adb」**：macOS `brew install android-platform-tools`；装完新开会话让 PATH 生效，或用环境变量 `ADB_PATH` 指到 adb 可执行文件。
- **设备 unauthorized**：解锁手机，在 USB 调试弹窗里勾选「始终允许」并点允许，重跑 `phone__status`。
- **「没有可用于操作的 Android 设备」**：检查 USB 线与「开发者选项 → USB 调试」；无线调试先 `adb pair` + `adb connect`（终端里执行，插件不管配对）。
- **uiautomator dump 失败**：锁屏/系统弹窗/持续动画都会导致；先解锁、关动画再试；实在不行截图 + 坐标。
- **中文输入报缺 ADBKeyboard**：按报错里的指引安装并 `ime set com.android.adbkeyboard/.AdbIME`；插件会自动切换输入法，但要先装好。
- **`wait_for` 一直 found=false**：截图确认当前界面；可能停在弹窗、锁屏、或目标文案带空格/大小写不一致（匹配是子串、不分大小写）。
- **截图全黑/空白**：部分应用禁止截屏（FLAG_SECURE），这是系统行为；改用控件树操作。
