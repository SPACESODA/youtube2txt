# youtube2txt

**youtube2txt** (YouTube Transcript Grabber) extracts available YouTube captions into clean text using `yt-dlp` on your own machine.

Current source version: **v1.4.2**. This version keeps the macOS app in the menu bar without a Dock icon and fixes release asset uploads for update checks. It includes the dependency security updates from v1.4.1.

> [!IMPORTANT]
> Run the backend locally so requests use your own network connection. YouTube may still require cookies, apply rate limits, or block requests. Transcripts are available only when the video has accessible captions.

<br>

## Features

- **Local Fetching**: Uses `yt-dlp` to retrieve available manual and automatically generated captions.
- **Multi-language Transcripts**: Fetch transcripts in different available languages when provided by YouTube.
- **Instant Copy/Download**: One-click copy to clipboard or download as `.txt` for LLM use.

### What is yt-dlp?

[yt-dlp](https://github.com/yt-dlp/yt-dlp) is an open-source command-line tool for extracting info and media from YouTube and many other sites. Here, it retrieves captions without downloading the video.

<br>

## How to Use

### Method 1: Desktop App (recommended)

Download an available installer from [GitHub Releases](https://github.com/SPACESODA/youtube2txt/releases). The source version above may be newer than the published installers. The app starts the local server in the background and includes its own Node runtime. The macOS app requires **macOS 13 (Ventura) or later**.

For a locally built v1.4.2 macOS installer, open `dist/youtube2txt-v1.4.2-mac-arm64.dmg` on Apple Silicon or the corresponding `mac-x64.dmg` on Intel, drag the app to Applications, and launch it. Each installer must be built separately. Unsigned builds may require approval in macOS System Settings → Privacy & Security.

On macOS, the app runs in the menu bar without a Dock icon. On Windows, it runs in the system tray (notification area), without an application window or taskbar button; Windows may put the icon in the hidden-icons overflow. Click the **app icon** to open the **menu**, launch the browser UI, check for updates, or quit. (If port 3000 is busy, the app picks the next available port automatically.)

### Method 2: Local Install by "quickstart" (recommended)

1. Install **Node.js 24+** (includes npm): https://nodejs.org/
2. On **macOS/Linux**, install **Python 3**: https://www.python.org/downloads/
3. From the repo folder (use `cd`), run:
    ```bash
    npm run quickstart
    ```

This runs a preflight check, installs dependencies, and starts the server.

### Method 3: Local Install Manually

Use the same Node.js and Python prerequisites as Method 2. From the repository folder:

```bash
npm ci
npm start
```
Open `http://localhost:3000` after the server starts.

**To Restart:** If you need to stop or restart the server, simply press `Ctrl + C` in your terminal to stop it, then run `npm start` again.  
**To Check:** If you want to check dependencies, run:
```bash
npm run doctor
```

### Method 4: Docker

If you already use Docker, you can run it without local Node/npm installs.  
Requires Docker Desktop (or Docker Engine + Compose v2). The default Linux `yt-dlp` download is x86_64; on an ARM host, use an amd64 container or provide a matching executable through `YTDLP_PATH`.
```bash
docker compose up --build
```
Open `http://localhost:3000` after startup. The image uses Node 24.

<br>

## Configuration & Troubleshooting

### First startup

An internet connection is required to fetch captions. If no `yt-dlp` executable is configured, stored locally, or found on `PATH`, the server downloads one from the official yt-dlp releases. The desktop app stores it in its application data directory. A source install stores it in the repository folder by default.

Some YouTube requests also need an external JavaScript runtime supported by [yt-dlp](https://github.com/yt-dlp/yt-dlp#dependencies). Source installs pass their Node executable automatically; desktop builds can use `YTDLP_JS_RUNTIME` to point to a separately installed runtime if needed.

### Using the latest UI

Access the tool at `http://localhost:3000`, or use the hosted page which includes the latest UI updates:

- **GitHub Pages**: [https://spacesoda.github.io/youtube2txt/](https://spacesoda.github.io/youtube2txt/)
- **Auto-connect to Local Server**: [https://spacesoda.github.io/youtube2txt/?apiBase=http://localhost:3000](https://spacesoda.github.io/youtube2txt/?apiBase=http://localhost:3000)

The hosted UI still needs your local backend running. If the desktop app chooses another port, use the address opened by its tray menu, or update `apiBase` to that port.

### Optional Environment Variables

- `YTDLP_PATH`: Use an existing `yt-dlp` binary from a custom path.
- `YTDLP_COOKIES`: Path to a YouTube cookies file, when authentication is needed.
- `YTDLP_JS_RUNTIME`: Runtime specification passed to yt-dlp, for example `node:/absolute/path/to/node`.
- `YT2TXT_DATA_DIR`: Directory for downloaded helpers and temporary files in source installs.
- `HOST`: Source-server bind address (default `0.0.0.0`). Use `127.0.0.1` for access from this machine only.
- `PORT`: Source-server port (default `3000`).

The desktop launcher binds to `127.0.0.1`, tries ports `3000`–`3019`, and manages its own data directory; `HOST`, `PORT`, and `YT2TXT_DATA_DIR` do not override those launcher settings.

### Per-project Node Version

To keep Node isolated and avoid conflicts with other projects:

- **nvm (macOS/Linux)**: run `nvm install` then `nvm use` (this repo includes `.nvmrc`).
- **nvm-windows**: https://github.com/coreybutler/nvm-windows
- **Volta (macOS/Windows/Linux)**: https://volta.sh (this repo pins Node 24 via `package.json`).

### Troubleshooting

- `node: command not found` or `npm not found`: install Node.js 24+ from https://nodejs.org/
- `python3: command not found` or `Python was not found`: install Python 3 (macOS/Linux only).
- `EACCES` or `EPERM`: permissions issue. Avoid sudo; try deleting `node_modules` and re-running.
- `EADDRINUSE`: port 3000 is busy. Run with `PORT=3001 npm start`.
- `npm ERR! network`: network or proxy issue. Try again or switch networks.

<br>

## Building

### Build the App

To build the desktop app for your OS, install dependencies and run the build from the repo root:
```bash
nvm install
nvm use
npm ci
npm test
# Build for the current OS without publishing:
npm exec -- electron-builder --publish never

# On macOS only:
# Apple Silicon DMG only (fast local install)
npm run dist:mac-arm64
# Intel DMG only (fast local install)
npm run dist:mac-x64
# Updater artifacts for local update tests (latest-mac.yml + zip, can take quite a while)
npm run dist:mac-update-arm64
npm run dist:mac-update-x64
```
Build artifacts are written to `dist/`. The installer target depends on the OS you build on (macOS DMG, Windows NSIS, Linux AppImage).

### Dependency security

Run `npm audit` after updating dependencies. The `@electron/get` override in `package.json` keeps the build downloader on `global-agent` 4.1.3+ to remove the vulnerable `roarr` / `sprintf-js` chain. Remove it when electron-builder adopts a dependency chain that no longer needs it.

<br>

## License

This project is licensed under the MIT License.
