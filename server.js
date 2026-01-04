const express = require('express');
const cors = require('cors');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.static('public'));

// --- INITIALIZATION ---
const BIN_DIR = path.join(__dirname, 'bin');
const YTDLP_PATH = path.join(__dirname, 'yt-dlp');

// 1. Setup Python Environment (Symlink python3 -> bin/python)
function setupPython() {
    if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR);
    const symlinkPath = path.join(BIN_DIR, 'python');

    if (!fs.existsSync(symlinkPath)) {
        try {
            const python3Path = execSync('which python3').toString().trim();
            console.log(`[Server] Found python3 at: ${python3Path}`);
            fs.symlinkSync(python3Path, symlinkPath);
            console.log(`[Server] Created python symlink.`);
        } catch (e) {
            console.error(`[Server] Failed to setup python symlink: ${e.message}. yt-dlp might fail if 'python' is not in PATH.`);
        }
    }
    // Update PATH for this process
    process.env.PATH = `${BIN_DIR}:${process.env.PATH}`;
}

// 2. Download yt-dlp binary if missing
function setupYtDlp() {
    if (fs.existsSync(YTDLP_PATH)) {
        console.log('[Server] yt-dlp binary exists.');
        return;
    }
    console.log('[Server] Downloading yt-dlp binary...');
    const file = fs.createWriteStream(YTDLP_PATH);
    https.get('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos', (response) => {
        response.pipe(file);
        file.on('finish', () => {
            file.close();
            execSync(`chmod a+rx ${YTDLP_PATH}`);
            console.log('[Server] yt-dlp downloaded and executable.');
        });
    });
}

setupPython();
setupYtDlp();

// --- ROUTES ---

app.get('/transcript', async (req, res) => {
    const videoId = req.query.videoId;
    if (!videoId) return res.status(400).json({ error: 'Missing videoId' });

    console.log(`[Server] Fetching transcript for: ${videoId}`);

    try {
        const transcript = await fetchTranscriptYtDlp(videoId);
        res.json(transcript);
    } catch (error) {
        console.error('[Server] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Local Transcript Server running at http://localhost:${PORT}`);
});

// --- HELPER FUNCTIONS ---

async function fetchTranscriptYtDlp(videoId) {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const outputBase = path.join(__dirname, `temp_${videoId}`);

    // Commands:
    // --skip-download: Don't download video
    // --write-subs: Write manual subs
    // --write-auto-subs: Write auto-generated subs
    // --sub-lang en: Prefer English
    // --output: Output filename template
    // --sub-format vtt: Ensure VTT format for easy parsing

    const cmd = `./yt-dlp --skip-download --write-subs --write-auto-subs --sub-lang "en,en-US,en-GB" --sub-format vtt --output "${outputBase}" "${url}"`;

    return new Promise((resolve, reject) => {
        // Use exec with increased buffer
        exec(cmd, { cwd: __dirname, maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
            if (error) {
                // If error, check if it's just "no subtitles" warning?
                // yt-dlp returns non-zero if download fails.
                console.error(`[yt-dlp] Error: ${stderr}`);
                // Cleanup potentially
                cleanup(outputBase);
                return reject(new Error('Failed to fetch subtitles. ' + stderr.substring(0, 100)));
            }

            // Find the created file
            // yt-dlp might create temp_ID.en.vtt or temp_ID.en-US.vtt
            const dir = __dirname;
            const files = fs.readdirSync(dir).filter(f => f.startsWith(`temp_${videoId}`) && f.endsWith('.vtt'));

            if (files.length === 0) {
                // Cleanup
                cleanup(outputBase);
                return reject(new Error('No English transcript found.'));
            }

            // Pick first file
            const subtitleFile = path.join(dir, files[0]);
            console.log(`[Server] Reading subtitle file: ${files[0]}`);

            try {
                const content = fs.readFileSync(subtitleFile, 'utf8');
                const parsed = parseVTT(content);
                resolve(parsed);
            } catch (e) {
                reject(e);
            } finally {
                // Cleanup ALL temp files for this ID
                cleanup(outputBase);
            }
        });
    });
}

function cleanup(baseName) {
    // baseName has full path but no extension? 
    // Actually baseName is like ".../temp_VIDEOID".
    // yt-dlp appends .en.vtt
    const dir = path.dirname(baseName);
    const prefix = path.basename(baseName);
    try {
        const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix));
        files.forEach(f => fs.unlinkSync(path.join(dir, f)));
    } catch (e) { }
}

function parseVTT(vttText) {
    // Simple VTT parser
    const lines = vttText.split('\n');
    const items = [];
    let current = null;

    // VTT format:
    // WEBVTT
    //
    // 00:00:00.000 --> 00:00:02.000
    // Text line

    // Regex for timestamp
    const timeRegex = /(\d{2}:\d{2}:\d{2}\.\d{3})\s-->\s(\d{2}:\d{2}:\d{2}\.\d{3})/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line === 'WEBVTT') continue;

        const match = line.match(timeRegex);
        if (match) {
            if (current) items.push(current);
            current = {
                // simple duration calc or just keep string? 
                // Let's keep parsed structure for app.js
                // app.js expects { text, ... }
                start: match[1],
                end: match[2],
                text: ''
            };
        } else if (current) {
            // Append text (handle multi-line)
            current.text = current.text ? current.text + ' ' + line : line;
        }
    }
    if (current) items.push(current);

    // Filter out metadata lines if any (like "align:start position:0%")
    // Usually yt-dlp VTT is clean text.
    return items.map(item => ({
        text: item.text.replace(/<[^>]*>/g, '').trim() // Remove any inner tags
    })).filter(i => i.text); // Remove empty
}
