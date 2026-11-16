---
name: ffmpeg
description: "用 ffmpeg 与 ffprobe 处理音视频：探测时长/流/编码、转码与压缩、无损剪辑、缩放、remux 加 faststart、提取音轨、按帧或按秒抽图、输出进度。用户提到视频、音频、转码、压缩、剪辑、抽帧、封面、格式转换、ffmpeg 时使用。覆盖已有文件前必须确认。"
---

# FFmpeg 媒体工作流

本技能随 Kova 的 `ffmpeg` 插件分发，封装官方 `ffmpeg` / `ffprobe` 二进制。插件不保存凭据。

## 前置检查

1. 检查版本与编码器：

```bash
ffmpeg -version
ffprobe -version
ffmpeg -hide_banner -encoders | grep -E "libx264|libx265|aac"
```

2. macOS 安装：`brew install ffmpeg`；其他平台见 https://ffmpeg.org/download.html。
3. 先探测再处理，避免凭猜测选编码参数。
4. 处理前确认输出路径，不要覆盖源文件。

## 常用命令

```bash
# 探测
ffprobe -v error -show_entries format=duration,size -of json in.mp4
ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,width,height,r_frame_rate -of json in.mp4

# 转码与压缩
ffmpeg -i in.mp4 -c:v libx264 -crf 23 -preset fast -c:a aac -b:a 128k out.mp4

# 无损剪辑（重编码边界需另加 -c:v libx264）
ffmpeg -ss 00:00:10 -i in.mp4 -t 30 -c copy clip.mp4

# 缩放
ffmpeg -i in.mp4 -vf "scale=1280:-2" -c:v libx264 -crf 23 out.mp4

# remux 并优化网页播放
ffmpeg -i in.mov -c copy -movflags +faststart out.mp4

# 提取音轨 / 抽帧
ffmpeg -i in.mp4 -vn -c:a aac audio.m4a
ffmpeg -i in.mp4 -vf "fps=1" frames/%04d.jpg

# 进度
ffmpeg -i in.mp4 -progress pipe:1 -nostats -f null -
```

## 输出与脚本

- `ffprobe -of json` 输出结构化媒体信息，优先用它判断时长、流和编码。
- `ffmpeg -progress pipe:1` 输出 key=value 行，可解析 `out_time_ms` 与 `progress`。
- 批量处理前先用单个文件验证参数。

## 安全约定

- ffmpeg 默认会询问是否覆盖；脚本中使用 `-y` 前必须确认目标文件可覆盖。
- 先输出到新文件，成功后再替换源文件；不要原地覆盖。
- 处理长视频前确认磁盘空间；抽帧输出目录先创建。
- 许可：默认构建为 LGPL-2.1+；启用 `--enable-gpl`（如 libx264）后为 GPL-2+，以实际构建参数为准。

## 参考

- ffmpeg：https://ffmpeg.org/ffmpeg.html
- ffprobe：https://ffmpeg.org/ffprobe.html
- 编码器与滤镜以 `ffmpeg -h` 为准。
