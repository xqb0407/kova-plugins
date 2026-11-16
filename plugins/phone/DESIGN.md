# phone-use 插件设计（Android / ADB）

状态：v0.2.0 已实现（13 个工具；89 项假 adb 端到端断言通过，待真机回归，见 README「验证」）。
v0.2 增补（参考 MiniMax phone-use 的 android_use 设计）：动作内嵌 observe、scroll_find、
matchIndex 消歧、doctor 自检、verified/uncertain 不重放规则。
目标：让 agent 在一台 Android 设备上完成「看界面 → 操作 → 验证」的闭环，
用于移动端 QA、App 操作自动化、跨端流程验证。

> 说明：MiniMax Code 的 phone use 文档没能访问（网络超时），本设计不照搬其实现，
> 只对齐能力面：截图 / 控件树 / 点击滑动 / 输入 / 启动应用。

## 1. 目标与非目标

**做**

- 真机（USB / 无线 ADB）与模拟器（AVD）统一走 ADB；
- 截图 + uiautomator 控件树双通道：截图给视觉上下文，控件树给稳定定位；
- 基础操作：点击、长按、滑动、文本输入、按键、启动/停止应用；
- 等待与验证：按文本/描述/id 轮询界面变化；
- 每一步操作后都能重新截图确认，形成可回溯的操作链。

**不做（至少 v1 不做）**

- 云手机（需要厂商 API / 账号）；
- iOS 真机（需要 WebDriverAgent/Appium + 签名与开发者账号）；
- 实时镜像面板与手动接管（需要宿主新增「面板 ↔ MCP」实时通道）；
- 安装 APK、root、读取通讯录/短信/相册等隐私数据；
- 破解锁屏、绕过应用保护、模拟定位/改机等。

## 2. 形态

**技能 + MCP**，无面板。沿用现有插件结构：

```
plugins/phone/
├── .kova-plugin/plugin.json
├── .mcp.json                  # ${BUN} 跑 mcp/server.ts
├── icon.svg
├── README.md
├── skills/phone/SKILL.md      # 操作流程、选择器优先级、安全规则
└── mcp/
    ├── server.ts              # NDJSON JSON-RPC；支持 mcpContent 图片透传
    ├── tools.ts               # 11 个工具的参数校验与结果整形
    └── lib/
        ├── adb.ts             # 找 adb / 选设备 / shell / exec-out / 超时
        ├── ui.ts              # dump + 解析 + 紧凑节点 + selector
        └── image.ts           # PNG 校验、尺寸读取、缩放、工作区落盘
```

后续若要「实时镜像 + 手动接管」，再评估面板方案（见 §8）。

## 3. 核心交互回路

```
status（设备/屏幕/输入法）
  → screenshot（看当前界面）
  → ui（拿控件与中心点）
  → tap / swipe / text / key（按 selector 优先，坐标兜底）
  → screenshot 或 wait_for（验证结果）
  → 循环
```

两条硬约束来自宿主：

- **文本结果上限 8KB / 1000 行**：UI 树必须紧凑——只保留有文本/描述/id 或可点击/可滚动的
  节点，默认最多 80 条，长文本截断。
- **图片单张 ≤ 2MiB**（超限会走宿主归一化）：截图默认缩到最长边 1400px；需要原图时
  落盘到工作区并返回路径。

## 4. 工具面（11 个）

| 工具 | 作用 | 关键参数 |
| --- | --- | --- |
| `status` | adb 路径/版本、设备列表、选中设备、屏幕尺寸、Android 版本、ADBKeyboard/输入法 | `serial?` |
| `screenshot` | 截图，返回图片 + 元信息 | `serial?`, `maxSide?`, `savePath?`, `inline?` |
| `ui` | 控件树（紧凑） | `serial?`, `find?`, `clickableOnly?`, `limit?` |
| `tap` | 点击 | `x,y` 或 `text/desc/id`；`serial?` |
| `long_press` | 长按 | 同上 + `durationMs?` |
| `swipe` | 滑动 | `x1,y1,x2,y2,durationMs?` |
| `text` | 输入文本 | `text`, `submit?`, `method?`（auto/ascii/adbkeyboard） |
| `key` | 按键 | `key`（home/back/enter/… 或数字 keycode） |
| `open_app` | 启动/停止应用 | `package`, `activity?`, `stop?` |
| `apps` | 列出第三方应用 | `filter?`, `limit?` |
| `wait_for` | 等待界面出现某元素 | `text/desc/id`, `timeoutMs?`, `intervalMs?` |

设计要点：

- **selector 优先于坐标**：`tap({text:"登录"})` 内部会先 dump、匹配、取中心点再点；
  返回命中的节点与匹配数量，便于复核。坐标点击保留作为兜底。
- **不做 `shell` 工具**：避免模型用 `adb shell` 绕过能力边界；需要的信息用专门工具取。
- **不做安装 APK**：v1 不引入「装未知应用」的风险面。
- **中文输入**：`input text` 只支持 ASCII；非 ASCII 走 ADBKeyboard 的
  `ADB_INPUT_B64` 广播。没装 ADBKeyboard 时明确报错并给安装说明，不静默丢字。

## 5. 设备与配置

前置：

1. 安装 Android Platform Tools（macOS：`brew install android-platform-tools`）；
2. 手机开「开发者选项 → USB 调试」，连接后允许本机调试；
3. 无线调试可选：`adb pair <ip:port>` + `adb connect <ip:port>`；
4. 中文输入可选：安装 ADBKeyboard 并设为当前输入法。

设备选择规则（防止点错机器）：

- 显式 `serial` → 必须存在且状态为 `device`，否则报错并列出当前设备；
- 未给 `serial` → 只有一台在线设备时自动选；0 台或多台都直接报错，不猜。

## 6. 安全与边界

- **敏感操作先确认**：支付/转账/删除、给他人发消息、修改账号设置，必须用户明确指示；
  技能里写成硬规则，并在执行前复述将要点的元素。
- **不越权**：不 root、不绕过锁屏/应用保护、不读隐私数据、不装未知 APK。
- **可回滚**：每次操作后截图验证；重要流程前提醒用户当前界面可手动接管。
- **锁屏/密码**：只提示用户解锁，不尝试猜密码或图案。
- **误触**：能 selector 就不坐标；坐标必须来自当前 UI 树或用户指定。

## 7. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| uiautomator dump 失败（动画/锁屏/弹窗） | 失败重试一次；仍失败给解锁/降级建议，允许截图+坐标 |
| 截图超 2MiB | 默认缩到 1400px；需要原图落盘并在结果里给路径 |
| 非 ASCII 输入丢失 | 检测 ADBKeyboard，缺失时报错而不是静默失败 |
| 操作延迟（每次 dump ~0.5–1s） | `wait_for` 轮询代替盲目 sleep；文档说明批量操作的成本 |
| 分辨率/旋转变化 | 坐标只从实时 UI 树取，不缓存 |
| 多设备误操作 | 0/多台一律报错，要求 serial |
| 模型乱点 | 技能强制「点击前复述目标元素、点击后验证」 |

## 8. 备选方案与取舍

- **Appium / WebDriverAgent**：选择器更稳、支持 iOS，但依赖重、版本敏感、需要签名；
  v1 不选，作为 iOS 需求出现时的升级路径。
- **uiautomator2（Python）**：封装更好，但引入 Python 依赖；ADB 原生命令已足够。
- **scrcpy 实时镜像面板**：体验最好，但需要宿主新增面板与控制通道；列为 v2。
- **云手机**：需要厂商 API 与账号，超出插件范围。

## 9. 分期

- **v0.1（观察 + 基础操作）**：`status` / `screenshot` / `ui` / `tap` / `swipe` / `key`
- **v0.2（完整回路）**：`text`（含 ADBKeyboard）、`open_app` / `apps`、`wait_for`、`long_press`
- **v0.3（稳定性）**：selector 匹配细节、错误恢复、真机回归
- **v2（可选）**：实时镜像面板 + 手动接管；iOS 支持

## 10. 测试策略

- **假 adb shim**：一个可切换 0/1/多设备、dump 失败、大截图、非 ASCII 输入的 shell 脚本，
  覆盖命令构造、XML 解析、错误路径；
- **真机 checklist**：截图、UI 树、按文本点击、输入（中/英）、启动应用、等待、旋转、
  锁屏、无线调试、多设备。

## 11. 需要确认的点

1. **设备范围**：Android 真机 / 模拟器 / 两者（默认两者）；是否必须支持 iOS？
2. **用途优先**：移动端 QA 与 App 自动化优先，还是要覆盖生活类 App 操作（影响安全规则强度）？
3. **形态**：v1 只要 agent 回路（无面板），还是需要「实时镜像 + 手动接管」面板（工期约翻倍）？
