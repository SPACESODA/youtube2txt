# youtube2txt

**youtube2txt** (YouTube Transcript Grabber) — A robust, locally-hosted tool to extract clean transcripts from any YouTube video. It runs on your own machine to bypass YouTube's IP blocks on public proxies, ensuring high reliability by using the powerful `yt-dlp` engine under the hood.

> [!IMPORTANT]
> This tool must be hosted locally on your own machine to avoid IP blocks from YouTube.

## Features

- **Reliable Fetching**: Uses `yt-dlp` binaries to handle YouTube's latest anti-bot measures.
- **Clean UI**: Minimalist, distraction-free interface.
- **Instant Copy/Download**: One-click copy to clipboard or download as `.txt` for LLM use.
- **Local Privacy**: All requests go through your own internet connection; no external API servers.

## How to Use

### 1. Prerequisites
- **Node.js**: Ensure you have Node.js installed.
- **Python 3**: Required on macOS/Linux for the underlying extraction engine. Not required on Windows.

### 2. Installation
Run this command once to install dependencies:
```bash
npm install
```

### 3. Start the Server
To run the tool:
```bash
npm start
```
This will:
1.  Start the local server at `http://localhost:3000`.
2.  Automatically download the `yt-dlp` binary if needed.
3.  Serve the web interface.

**To Restart:**
If you need to stop or restart the server, simply press `Ctrl + C` in your terminal to stop it, then run `npm start` again.

### 3.1 Optional Environment Variables
- `YTDLP_PATH`: Use an existing `yt-dlp` binary from a custom path.
- `YTDLP_COOKIES`: Path to a cookies file for YouTube (helps with rate limits).
- `PORT`: Override the server port (default is 3000).

### 3.2 Hosting the UI Separately
If you host `public/index.html` somewhere else, tell the UI where your server is:
`https://your-ui-host/?apiBase=http://YOUR_SERVER_IP:3000`
If the UI is served by the same server, no parameters are needed:
`http://YOUR_SERVER_IP:3000`

### 3.3 Language Selection
By default the server detects the video's default caption language and uses that. The UI shows available language codes in a dropdown. To preselect a language, add `lang`:
`https://your-ui-host/?apiBase=http://YOUR_SERVER_IP:3000&lang=es`

### 4. Why Local?
Most online transcript tools fail because YouTube blocks their shared server IPs ("429 Too Many Requests").
Since this tool runs **locally**, it uses your residential IP address, which YouTube trusts, effectively eliminating these errors.
