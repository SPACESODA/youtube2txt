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

### 1. Prerequisites
- **Node.js**: Ensure you have Node.js installed.
- **Python 3**: Required on macOS/Linux for the underlying extraction engine. Not required on Windows.

### 2. Installation
Download this repo (or clone it), then `cd` into the folder.  
Run this command to install dependencies:
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

#### Optional Environment Variables
- `YTDLP_PATH`: Use an existing `yt-dlp` binary from a custom path.
- `YTDLP_COOKIES`: Path to a cookies file for YouTube (helps with rate limits).
- `HOST`: Override the server host (default is 0.0.0.0).
- `PORT`: Override the server port (default is 3000).

#### Using the latest UI
Access the tool at `http://localhost:3000`, or use the hosted page which includes the latest UI updates:
- **GitHub Pages**: [https://spacesoda.github.io/youtube2txt/](https://spacesoda.github.io/youtube2txt/)
- **Auto-connect to Local Server**: [https://spacesoda.github.io/youtube2txt/?apiBase=http://localhost:3000](https://spacesoda.github.io/youtube2txt/?apiBase=http://localhost:3000)

## License

This project is licensed under the MIT License.
