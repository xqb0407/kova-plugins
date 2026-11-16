#!/usr/bin/env bash
# 假 adb：phone 插件端到端测试用的最小替身（DESIGN.md §10）。
# server 通过 ADB_PATH 指到本脚本，行为可用环境变量切换：
#   FAKE_DEVICES=0|1|2|unauthorized  adb devices 的设备数量/状态（缺省 1 台在线）
#   FAKE_NO_ADBKEYBOARD=1            设备上没装 ADBKeyboard
#   FAKE_IME=<ime>                   当前输入法（缺省 com.android.adbkeyboard/.AdbIME）
#   FAKE_SCREENSHOT=<png>            screencap 输出的 PNG 文件路径
#   FAKE_LOG=<file>                  追加记录每次调用参数，供测试断言命令构造
set -u
[ -n "${FAKE_LOG:-}" ] && echo "$*" >> "$FAKE_LOG"
DIR="$(cd "$(dirname "$0")" && pwd)"

case "$*" in
  "version")
    echo "Android Debug Bridge version 1.0.41"
    echo "Version 34.0.5-fake"
    exit 0;;
  "devices -l")
    echo "List of devices attached"
    case "${FAKE_DEVICES:-1}" in
      0) ;;
      2)
        echo "FAKE001             device product:fake model:fake_model device:fake"
        echo "FAKE002             device product:fake model:fake_model device:fake";;
      unauthorized)
        echo "FAKE001             unauthorized usb:1-1 transport_id:1";;
      *)
        echo "FAKE001             device product:fake model:fake_model device:fake";;
    esac
    exit 0;;
esac

case "$*" in
  *" shell getprop ro.product.model")        echo "Pixel Fake";;
  *" shell getprop ro.build.version.release") echo "14";;
  *" shell getprop ro.build.version.sdk")     echo "34";;
  *" shell wm size")                          echo "Physical size: 1080x2340";;
  *" shell settings get secure default_input_method") echo "${FAKE_IME:-com.android.adbkeyboard/.AdbIME}";;
  *" shell pm list packages -3")
    echo "package:com.fake.chat"
    echo "package:com.fake.maps"
    echo "package:com.fake.settings";;
  *" shell pm list packages com.android.adbkeyboard")
    [ -z "${FAKE_NO_ADBKEYBOARD:-}" ] && echo "package:com.android.adbkeyboard";;
  *" shell uiautomator dump"*)                echo "UI hierchary dumped to: /sdcard/kova_ui.xml";;
  *" exec-out cat /sdcard/kova_ui.xml")
    # fixture 变体按「日志里已出现过的命令」切换，模拟界面随操作变化：
    #   FAKE_UI_SCROLLED_AFTER=<子串>  日志出现该子串后改服 ui-scrolled.xml（滚动后的界面）
    #   FAKE_UI_TYPED_AFTER=<子串>     日志出现该子串后改服 ui-typed.xml（输入后的界面）
    LOG="${FAKE_LOG:-}"
    if [ -n "${FAKE_UI_SCROLLED_AFTER:-}" ] && [ -n "$LOG" ] && grep -q "$FAKE_UI_SCROLLED_AFTER" "$LOG" 2>/dev/null; then
      cat "$DIR/ui-scrolled.xml"
    elif [ -n "${FAKE_UI_TYPED_AFTER:-}" ] && [ -n "$LOG" ] && grep -q "$FAKE_UI_TYPED_AFTER" "$LOG" 2>/dev/null; then
      cat "$DIR/ui-typed.xml"
    else
      cat "$DIR/ui.xml"
    fi;;
  *" exec-out screencap -p")                  cat "${FAKE_SCREENSHOT:?FAKE_SCREENSHOT 未设置}";;
  *" shell am broadcast"*)
    echo "Broadcasting: Intent { act=ADB_INPUT_B64 }"
    echo "Broadcast completed: result=0";;
  *" shell am start"*)        echo "Starting: Intent { cmp=com.fake.settings/.MainActivity }";;
  *" shell am force-stop"*)   ;;
  *" shell monkey"*)          echo "Events injected: 1";;
  *" shell ime set"*)
    if [ -n "${FAKE_IME_SET_FAILS:-}" ]; then
      echo "Error: could not set the default IME" >&2
      exit 101
    fi;;
  *" shell dumpsys activity activities")
    echo "  mResumedActivity: ActivityRecord{123456 u0 com.fake.settings/.MainActivity t42}";;
  *" shell input"*)           ;;
  *)
    echo "fake-adb: 未处理的调用: $*" >&2
    exit 1;;
esac
exit 0
