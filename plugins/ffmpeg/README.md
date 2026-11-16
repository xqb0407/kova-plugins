# FFmpeg 插件

用 ffmpeg 与 ffprobe 探测媒体信息、转码、剪辑、缩放、抽帧、提取音轨与查看进度。插件只包含技能，负责安装、授权与命令发现，不包含 MCP 服务器、HTTP 客户端或凭据。

## 安装

```bash
brew install ffmpeg
ffmpeg -version
ffprobe -version
```

## 授权

无需授权。先探测再处理：

```bash
ffprobe -v error -show_entries format=duration -of json in.mp4
```

## 常用命令

```bash
ffmpeg -i in.mp4 -c:v libx264 -crf 23 -c:a aac out.mp4
ffmpeg -ss 00:00:10 -i in.mp4 -t 30 -c copy clip.mp4
ffmpeg -i in.mp4 -vf "fps=1" frames/%04d.jpg
```

## 内置技能

`ffmpeg` —— 探测、转码、剪辑、缩放、抽帧与提取音轨

## 安全约定

- 覆盖文件前必须确认；先输出到新文件。
- 脚本中的 `-y` 仅在确认可覆盖后使用。
- 长视频处理前确认磁盘空间。

## 来源与许可

- 上游：https://ffmpeg.org/
- 许可：LGPL-2.1+；启用 GPL 组件后为 GPL-2+
