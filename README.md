# YouTube Transcript Grabber (Local)

A robust, locally-hosted tool to extract transcripts from any YouTube video.
This tool runs on your own machine to bypass YouTube's IP blocks on public proxies, ensuring 100% reliability by using the powerful `yt-dlp` engine under the hood.

## Features

- **Reliable Fetching**: Uses `yt-dlp` binaries to handle YouTube's latest anti-bot measures.
- **Clean UI**: Minimalist, distraction-free interface.
- **Instant Copy/Download**: One-click copy to clipboard or download as `.txt` for LLM use.
- **Local Privacy**: All requests go through your own internet connection; no external API servers.

## How to Use

### 1. Prerequisites
- **Node.js**: Ensure you have Node.js installed.
- **Python 3**: Required for the underlying extraction engine (Standard on Mac/Linux).

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
2.  Automatically download/update the `yt-dlp` binary if needed.
3.  Serve the web interface.

**To Restart:**
If you need to stop or restart the server, simply press `Ctrl + C` in your terminal to stop it, then run `npm start` again.

### 4. Why Local?
Most online transcript tools fail because YouTube blocks their shared server IPs ("429 Too Many Requests").
Since this tool runs **locally**, it uses your residential IP address, which YouTube trusts, effectively eliminating these errors.
