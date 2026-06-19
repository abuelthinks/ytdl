# Media Downloader

A cross-platform desktop app for downloading videos and audio from the web, built on
[yt-dlp](https://github.com/yt-dlp/yt-dlp) and ffmpeg. Electron + React + TypeScript.

## Features

- Download video (MP4) or audio (MP3) from YouTube, Vimeo, and the many other sites yt-dlp supports
- Playlist support — paste a playlist link to queue every entry
- Per-item format and resolution selection, with a configurable concurrency limit
- Automatic, self-updating yt-dlp + ffmpeg (downloaded into the app's user-data folder on first run)
- Download history with "play" and "show in folder" actions
- Optional network proxy
- Companion Chrome extension (`extension/`) that sends the current tab to the app and injects a
  one-click download button on protected players like Kwik.cx

## How it works

On first launch the app checks for `yt-dlp` and `ffmpeg` (on `PATH` or in its own `bin` folder) and
downloads them if missing. Downloads are run as child processes and progress is streamed to the UI.

A small HTTP server listens on `127.0.0.1:30123` so the browser extension can hand off URLs. Only
extension and loopback origins are accepted — ordinary web pages cannot trigger downloads.

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## Browser extension

Load `extension/` as an unpacked extension at `chrome://extensions` (Developer mode → Load
unpacked). Keep the desktop app running; the popup will show "Connected" and you can send the
current tab with the **Download This Page** button.

## Disclaimer

For downloading content you own or are licensed to download. Respect the terms of service of the
sites you use and applicable copyright law.
