# youtube2txt

**youtube2txt** (YouTube Transcript Grabber) — A robust, locally-hosted tool to extract clean transcripts from any YouTube video. It runs on your own machine to bypass YouTube's IP blocks on public proxies, ensuring high reliability by using the powerful `yt-dlp` engine under the hood.

> [!IMPORTANT]
> This tool must run locally to avoid YouTube IP blocks. It uses your own IP, which YouTube trusts, so transcript fetches are far more reliable.

<br>

## Features

- **Reliable Fetching**: Uses `yt-dlp` binaries to handle YouTube's latest anti-bot measures.
- **Multi-language Transcripts**: Fetch transcripts in different available languages when provided by YouTube.
- **Instant Copy/Download**: One-click copy to clipboard or download as `.txt` for LLM use.

### What is yt-dlp?

[yt-dlp](https://github.com/yt-dlp/yt-dlp) is an open-source command-line tool for extracting info and media from YouTube and many other sites. Here, it powers transcript fetching and handles YouTube's anti-bot measures more reliably than typical web crawlers.

<br>

## How to Use

### Method 1:  Desktop App (recommended)
Download the latest installer from GitHub Releases and launch the app. It starts the local server in the background. No Node or Python required.

Click the tray **app icon** to open the **menu** and launch the browser UI. (If port 3000 is busy, the app picks the next available port automatically.)

### Method 2: Local Install by "quickstart" (recommended)
1. Install **Node.js 20+** (includes npm): https://nodejs.org/
2. On **macOS/Linux**, install **Python 3**: https://www.python.org/downloads/
3. From the repo folder (use `cd`), run:
    ```bash
    npm run quickstart
    ```
This runs a preflight check, installs dependencies, and starts the server.

### Method 3: Local Install Manually
```bash
npm install
npm start
```
**To Restart:** If you need to stop or restart the server, simply press `Ctrl + C` in your terminal to stop it, then run `npm start` again.  
**To Check:** If you want to check dependencies, run:
```bash
npm run doctor
```

### Method 4: Docker
If you already use Docker, you can run it without local Node/npm installs.  
Requires Docker Desktop (or Docker Engine + Compose v2).
```bash
docker compose up --build
```

<br>

## Configuration & Troubleshooting

### Using the latest UI
Access the tool at `http://localhost:3000`, or use the hosted page which includes the latest UI updates:
- **GitHub Pages**: [https://spacesoda.github.io/youtube2txt/](https://spacesoda.github.io/youtube2txt/)
- **Auto-connect to Local Server**: [https://spacesoda.github.io/youtube2txt/?apiBase=http://localhost:3000](https://spacesoda.github.io/youtube2txt/?apiBase=http://localhost:3000)

### Optional Environment Variables
- `YTDLP_PATH`: Use an existing `yt-dlp` binary from a custom path.
- `YTDLP_COOKIES`: Path to a cookies file for YouTube (helps with rate limits).
- `HOST`: Override the server host (default is 0.0.0.0).
- `PORT`: Override the server port (default is 3000).

### Per-project Node Version
To keep Node isolated and avoid conflicts with other projects:
- **nvm (macOS/Linux)**: run `nvm install` then `nvm use` (this repo includes `.nvmrc`).
- **nvm-windows**: https://github.com/coreybutler/nvm-windows
- **Volta (macOS/Windows/Linux)**: https://volta.sh (this repo pins Node 20 via `package.json`).

### Troubleshooting
- `node: command not found` or `npm not found`: install Node.js 20+ from https://nodejs.org/
- `python3: command not found` or `Python was not found`: install Python 3 (macOS/Linux only).
- `EACCES` or `EPERM`: permissions issue. Avoid sudo; try deleting `node_modules` and re-running.
- `EADDRINUSE`: port 3000 is busy. Run with `PORT=3001 npm start`.
- `npm ERR! network`: network or proxy issue. Try again or switch networks.

<br>

## Building and Releasing

### Build the App
To build the desktop app for your OS, install dependencies and run the build from the repo root:
```bash
nvm use
npm install
npm test
npm run dist

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

### Publishing a Release
To publish a new release with app files reliably included, use the following commands:
```bash
git tag v1.3.8
git push origin v1.3.8
```

<br>

## License

This project is licensed under the MIT License.
