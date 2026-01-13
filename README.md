# youtube2txt

**youtube2txt** (YouTube Transcript Grabber) — A robust, locally-hosted tool to extract clean transcripts from any YouTube video. It runs on your own machine to bypass YouTube's IP blocks on public proxies, ensuring high reliability by using the powerful `yt-dlp` engine under the hood.

> [!IMPORTANT]
> This tool must be hosted locally on your own machine to avoid IP blocks from YouTube.

Since this tool runs **locally**, it uses your residential IP address, which YouTube trusts, effectively eliminating these errors.

## Features

- **Reliable Fetching**: Uses `yt-dlp` binaries to handle YouTube's latest anti-bot measures.
- **Multi-language Transcripts**: Fetch transcripts in different available languages when provided by YouTube.
- **Instant Copy/Download**: One-click copy to clipboard or download as `.txt` for LLM use.

### What is yt-dlp?

[yt-dlp](https://github.com/yt-dlp/yt-dlp) is a powerful, open-source command-line tool used to extract information and download media from YouTube and thousands of other sites. In this project, it is used as the core engine to fetch high-quality, timed transcripts while handling YouTube's complex anti-bot measures better than standard web crawlers.

## How to Use

### Method 1:  Desktop App (recommended)
Download the latest installer from GitHub Releases and launch the app. It starts the local server in the background (tray). No Node or Python required.

On first run, the server downloads `yt-dlp` automatically. Updates are delivered through the app (GitHub Releases). Use the tray menu to open the browser UI.

If port 3000 is busy, the app picks the next available port automatically, and the tray menu opens the correct URL.

Tested on macOS only. Please test on Windows and Linux.

### Method 2: Local Install by "quickstart" (recommended)
1. Install **Node.js 20+** (includes npm): https://nodejs.org/
2. On **macOS/Linux**, install **Python 3**: https://www.python.org/downloads/
3. From the repo folder (use `cd`), run:
    ```bash
    npm run quickstart
    ```
This runs a preflight check, installs dependencies, and starts the server.

### Method 3: Local Install manually
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

### Optional Environment Variables
- `YTDLP_PATH`: Use an existing `yt-dlp` binary from a custom path.
- `YTDLP_COOKIES`: Path to a cookies file for YouTube (helps with rate limits).
- `HOST`: Override the server host (default is 0.0.0.0).
- `PORT`: Override the server port (default is 3000).

### Using the latest UI
Access the tool at `http://localhost:3000`, or use the hosted page which includes the latest UI updates:
- **GitHub Pages**: [https://spacesoda.github.io/youtube2txt/](https://spacesoda.github.io/youtube2txt/)
- **Auto-connect to Local Server**: [https://spacesoda.github.io/youtube2txt/?apiBase=http://localhost:3000](https://spacesoda.github.io/youtube2txt/?apiBase=http://localhost:3000)

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

## License

This project is licensed under the MIT License.
