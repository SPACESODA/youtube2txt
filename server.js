// Backend for youtube2txt: serves the UI and exposes transcript/language APIs via yt-dlp.
const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const METADATA_TIMEOUT_MS = 30000;

app.use(cors());
app.use(express.static('public'));

// --- INITIALIZATION ---
const BIN_DIR = path.join(__dirname, 'bin');
const LOCAL_YTDLP_BASENAME = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const LOCAL_YTDLP_PATH = path.join(__dirname, LOCAL_YTDLP_BASENAME);
let YTDLP_PATH = null;

// 1. Setup Python Environment (Symlink python3 -> bin/python)
function setupPython() {
    if (process.platform === 'win32') {
        return;
    }
    if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR);
    const symlinkPath = path.join(BIN_DIR, 'python');

    if (!fs.existsSync(symlinkPath)) {
        const python3Path = findExecutableInPath(['python3', 'python']);
        if (python3Path) {
            console.log(`[Server] Found python at: ${python3Path}`);
            try {
                fs.symlinkSync(python3Path, symlinkPath);
                console.log('[Server] Created python symlink.');
            } catch (e) {
                console.error(`[Server] Failed to setup python symlink: ${e.message}. yt-dlp might fail if 'python' is not in PATH. Consider installing Python, adding it to your PATH, and ensuring this process has permission to create symlinks.`);
            }
        } else {
            console.error("[Server] Failed to setup python symlink: python not found in PATH. yt-dlp might fail if 'python' is not in PATH.");
        }
    }
    // Update PATH for this process
    process.env.PATH = `${BIN_DIR}${path.delimiter}${process.env.PATH}`;
}

// 2. Download yt-dlp binary if missing
function setupYtDlp() {
    const configuredPath = process.env.YTDLP_PATH;
    if (configuredPath && fs.existsSync(configuredPath)) {
        YTDLP_PATH = configuredPath;
        console.log(`[Server] Using yt-dlp from YTDLP_PATH: ${YTDLP_PATH}`);
        return Promise.resolve();
    }

    if (fs.existsSync(LOCAL_YTDLP_PATH)) {
        YTDLP_PATH = LOCAL_YTDLP_PATH;
        console.log('[Server] yt-dlp binary exists locally.');
        return Promise.resolve();
    }

    const pathCandidate = findExecutableInPath(process.platform === 'win32' ? ['yt-dlp.exe', 'yt-dlp'] : ['yt-dlp']);
    if (pathCandidate) {
        YTDLP_PATH = pathCandidate;
        console.log(`[Server] Using yt-dlp from PATH: ${YTDLP_PATH}`);
        return Promise.resolve();
    }

    console.log('[Server] Downloading yt-dlp binary...');
    const url = getYtDlpDownloadUrl();
    const tempPath = `${LOCAL_YTDLP_PATH}.tmp`;
    try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (e) {
        // Ignore temp cleanup errors.
    }

    return downloadFile(url, tempPath).then(() => {
        fs.renameSync(tempPath, LOCAL_YTDLP_PATH);
        if (process.platform !== 'win32') {
            // Restrict executable permissions to the owner to reduce exposure if the binary is compromised.
            fs.chmodSync(LOCAL_YTDLP_PATH, 0o700);
        }
        YTDLP_PATH = LOCAL_YTDLP_PATH;
        console.log('[Server] yt-dlp downloaded and executable.');
    });
}

setupPython();
const ytdlpReady = setupYtDlp();

// --- ROUTES ---

app.get('/transcript', async (req, res) => {
    const videoId = req.query.videoId;
    const lang = typeof req.query.lang === 'string' ? req.query.lang.trim() : '';
    if (!videoId) return res.status(400).json({ error: 'Missing videoId' });
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).json({ error: 'Invalid videoId format' });
    }
    if (lang && !/^[a-zA-Z0-9,-]+$/.test(lang)) {
        return res.status(400).json({ error: 'Invalid lang format' });
    }

    console.log(`[Server] Fetching transcript for: ${videoId}`);
    
    try {
        await ytdlpReady;
        const metadata = await fetchVideoMetadata(videoId);
        const languageFilter = lang && lang.toLowerCase() !== 'auto' ? lang : null;
        const preferredLanguage = languageFilter || metadata.captionLanguage || 'en,en-US,en-GB';
        if (!languageFilter && metadata.captionLanguage) {
            console.log(`[Server] Auto-selected subtitle language: ${metadata.captionLanguage}`);
        }
        const segments = await fetchTranscriptYtDlp(videoId, preferredLanguage);
        const title = metadata.title;
        res.json({ title, segments });
    } catch (error) {
        console.error('[Server] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.get('/languages', async (req, res) => {
    const videoId = req.query.videoId;
    if (!videoId) return res.status(400).json({ error: 'Missing videoId' });
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).json({ error: 'Invalid videoId format' });
    }

    try {
        const metadata = await fetchVideoMetadata(videoId);
        const languages = buildLanguageOptions(metadata.captionTracks || []);
        res.json({
            defaultLang: metadata.captionLanguage || '',
            languages
        });
    } catch (error) {
        console.error('[Server] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, HOST, () => {
    console.log(`Local Transcript Server running at http://${HOST}:${PORT}`);
});

// --- HELPER FUNCTIONS ---

async function fetchTranscriptYtDlp(videoId, languageFilter) {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const outputBase = path.join(
        __dirname,
        `temp_${videoId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    );
    const outputPrefix = path.basename(outputBase);

    // Commands:
    // --skip-download: Don't download video
    // --write-subs: Write manual subs
    // --write-auto-subs: Write auto-generated subs
    // --sub-lang <codes>: Prefer requested language(s)
    // --output: Output filename template
    // --sub-format vtt: Ensure VTT format for easy parsing

    if (!YTDLP_PATH) {
        throw new Error('yt-dlp is not available.');
    }
    const jsRuntime = `node:${process.execPath}`;
    const cookiesPath = process.env.YTDLP_COOKIES ? path.resolve(process.env.YTDLP_COOKIES) : null;
    const selectedLanguage = languageFilter;

    const args = [
        '--skip-download',
        '--write-subs',
        '--write-auto-subs',
        '--sub-lang', selectedLanguage,
        '--sub-format', 'vtt',
        '--js-runtimes', jsRuntime,
        '--output', outputBase
    ];

    if (cookiesPath) {
        if (fs.existsSync(cookiesPath)) {
            const outputIndex = args.indexOf('--output');
            const insertIndex = outputIndex === -1 ? args.length : outputIndex;
            args.splice(insertIndex, 0, '--cookies', cookiesPath);
        } else {
            console.warn(`[Server] YTDLP_COOKIES file not found: ${cookiesPath}`);
        }
    }

    args.push(url);
    const { code, stderr } = await runYtDlp(args);
    if (code !== 0) {
        console.error(`[yt-dlp] Error: ${stderr}`);
        cleanup(outputBase);
        const errorLine = stderr
            .split('\n')
            .map(line => line.trim())
            .find(line => line.startsWith('ERROR:'));
        const errorDetail = errorLine
            ? errorLine.replace(/^ERROR:\s*/, '')
            : stderr.trim();
        const trimmedDetail = errorDetail ? ` ${errorDetail.slice(0, 200)}` : '';
        throw new Error(`Subtitle download failed.${trimmedDetail}`);
    }

    // Find the created file
    // yt-dlp might create temp_ID.en.vtt or temp_ID.en-US.vtt
    const dir = __dirname;
    const files = fs.readdirSync(dir)
        .filter(f => f.startsWith(outputPrefix) && f.endsWith('.vtt'));

    if (files.length === 0) {
        cleanup(outputBase);
        throw new Error('No transcript found.');
    }

    try {
        const selected = pickBestSubtitle(files, dir);
        if (!selected) {
            throw new Error('No readable transcript found.');
        }
        console.log(`[Server] Reading subtitle file: ${selected.file}`);
        return selected.parsed;
    } finally {
        // Cleanup ALL temp files for this ID
        cleanup(outputBase);
    }
}

async function fetchVideoMetadata(videoId) {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    return new Promise((resolve) => {
        const fallback = { title: 'YouTube Video', captionLanguage: null, captionTracks: [] };
        let settled = false;
        const finish = (payload) => {
            if (settled) return;
            settled = true;
            resolve(payload);
        };

        const req = https.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        }, (res) => {
            if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                res.resume();
                return finish(fallback);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const match = data.match(/<title>(.*?)<\/title>/i);
                const playerResponse = extractPlayerResponse(data);
                const rawCaptionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
                const captionLanguage = pickCaptionLanguage(playerResponse, rawCaptionTracks);
                const captionTracks = extractCaptionTracks(rawCaptionTracks);
                const preferredTitle = getPreferredTitle(playerResponse, match);
                if (preferredTitle) {
                    finish({ title: `${preferredTitle} - YouTube`, captionLanguage, captionTracks });
                } else {
                    finish({ title: 'YouTube Video', captionLanguage, captionTracks });
                }
            });
        });

        req.setTimeout(METADATA_TIMEOUT_MS, () => {
            if (settled) return;
            req.destroy(new Error('Metadata request timed out.'));
        });

        req.on('error', () => finish(fallback));
    });
}

function cleanup(baseName) {
    // baseName has full path but no extension? 
    // Actually baseName is like ".../temp_VIDEOID".
    // yt-dlp appends .en.vtt
    const resolvedBase = path.resolve(baseName);
    const resolvedRoot = path.resolve(__dirname);
    const expectedPrefix = /^temp_[A-Za-z0-9_-]{11}_[0-9]+_[a-z0-9]{6}$/;
    const dir = resolvedRoot;
    const prefix = path.basename(resolvedBase);
    try {
        // Resolve real (symlink-free) paths for both the root and the directory to clean.
        const realRoot = fs.realpathSync.native ? fs.realpathSync.native(resolvedRoot) : fs.realpathSync(resolvedRoot);
        const realBaseDir = fs.realpathSync.native ? fs.realpathSync.native(path.dirname(resolvedBase)) : fs.realpathSync(path.dirname(resolvedBase));
        const relative = path.relative(realRoot, realBaseDir);
        // Ensure the base directory is within our application root (no path traversal or symlink escape).
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            console.warn(`Skipping cleanup for unexpected path: "${baseName}"`);
            return;
        }
    } catch (e) {
        // If we cannot safely resolve real paths, skip cleanup for safety.
        console.warn(`Skipping cleanup for baseName "${baseName}" due to path resolution error:`, e);
        return;
    }
    if (!expectedPrefix.test(prefix)) {
        console.warn(`Skipping cleanup for unexpected temp file prefix: "${prefix}"`);
        return;
    }
    try {
        const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix));
        files.forEach(f => fs.unlinkSync(path.join(dir, f)));
    } catch (e) {
        // Best-effort cleanup: failures are non-fatal but logged for diagnostics.
        console.warn(`Failed to clean up temporary files for baseName "${baseName}":`, e);
    }
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
        text: sanitizeTranscriptText(item.text)
    })).filter(i => i.text); // Remove empty
}

function sanitizeTranscriptText(text) {
    if (!text) return '';
    const decoded = decodeHtmlEntities(text);
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
        const char = decoded[i];
        if (char !== '<') {
            result += char;
            continue;
        }
        const closeIndex = decoded.indexOf('>', i + 1);
        if (closeIndex === -1) {
            result += char;
            continue;
        }
        const tagBody = decoded.slice(i + 1, closeIndex);
        if (/^(\d{1,2}:)?\d{2}:\d{2}\.\d{3}$/.test(tagBody)) {
            i = closeIndex;
            continue;
        }
        const next = decoded[i + 1];
        if (!next || !/[A-Za-z/!]/.test(next)) {
            result += char;
            continue;
        }
        i = closeIndex;
    }
    return result.trim();
}

function pickBestSubtitle(files, dir) {
    const candidates = files.map((file) => {
        try {
            const content = fs.readFileSync(path.join(dir, file), 'utf8');
            const parsed = parseVTT(content);
            const textLength = parsed.reduce((sum, item) => sum + item.text.length, 0);
            return { file, parsed, textLength };
        } catch (e) {
            return null;
        }
    }).filter(Boolean);

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.textLength - a.textLength || a.file.localeCompare(b.file));
    return candidates[0];
}

function runYtDlp(args) {
    return new Promise((resolve, reject) => {
        const child = spawn(YTDLP_PATH, args);
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, stdout, stderr }));
    });
}

function extractPlayerResponse(html) {
    const marker = 'ytInitialPlayerResponse';
    const markerIndex = html.indexOf(marker);
    if (markerIndex === -1) return null;
    const braceStart = html.indexOf('{', markerIndex);
    if (braceStart === -1) return null;
    let depth = 0;
    let inString = false;
    let escaping = false;
    for (let i = braceStart; i < html.length; i++) {
        const char = html[i];
        if (inString) {
            if (escaping) {
                escaping = false;
            } else if (char === '\\') {
                escaping = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }
        if (char === '"') {
            inString = true;
            continue;
        }
        if (char === '{') depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                const jsonText = html.slice(braceStart, i + 1);
                try {
                    return JSON.parse(jsonText);
                } catch (e) {
                    return null;
                }
            }
        }
    }
    return null;
}

function getPreferredTitle(playerResponse, htmlTitleMatch) {
    const fallbackTitle = htmlTitleMatch && htmlTitleMatch[1]
        ? decodeHtmlEntities(htmlTitleMatch[1])
        : null;
    const candidates = [
        playerResponse?.videoDetails?.title,
        playerResponse?.microformat?.playerMicroformatRenderer?.title?.simpleText,
        fallbackTitle
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string') {
            const trimmed = candidate.trim();
            if (trimmed) {
                return trimmed.replace(/\s*-\s*YouTube\s*$/i, '');
            }
        }
    }
    return null;
}

function decodeHtmlEntities(text) {
    if (!text || !text.includes('&')) return text || '';
    let result = '';
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char !== '&') {
            result += char;
            continue;
        }
        const semi = text.indexOf(';', i + 1);
        if (semi === -1 || semi - i > 10) {
            result += char;
            continue;
        }
        const entity = text.slice(i + 1, semi);
        switch (entity) {
            case 'amp':
                result += '&';
                i = semi;
                break;
            case 'quot':
                result += '"';
                i = semi;
                break;
            case '#39':
            case '#x27':
                result += "'";
                i = semi;
                break;
            case 'lt':
                result += '<';
                i = semi;
                break;
            case 'gt':
                result += '>';
                i = semi;
                break;
            default:
                result += char;
                break;
        }
    }
    return result;
}

function pickCaptionLanguage(playerResponse, captionTracks) {
    const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer;
    const tracks = captionTracks || captions?.captionTracks || [];
    if (tracks.length === 0) return null;
    const audioTracks = captions?.audioTracks || [];
    const defaultAudioTrack = audioTracks.find((track) => track.audioTrackType === 'AUDIO_TRACK_TYPE_DEFAULT') || audioTracks[0];
    if (defaultAudioTrack && Array.isArray(defaultAudioTrack.captionTrackIndices)) {
        for (const index of defaultAudioTrack.captionTrackIndices) {
            const track = tracks[index];
            if (track && track.kind !== 'asr') return track.languageCode;
        }
        const fallbackIndex = defaultAudioTrack.captionTrackIndices[0];
        if (typeof fallbackIndex === 'number' && tracks[fallbackIndex]) {
            return tracks[fallbackIndex].languageCode;
        }
    }
    const manualTrack = tracks.find((track) => track.kind !== 'asr');
    if (manualTrack) return manualTrack.languageCode;
    return tracks[0]?.languageCode || null;
}

function extractCaptionTracks(captionTracks) {
    return (captionTracks || []).map((track) => ({
        code: track.languageCode,
        name: extractCaptionName(track.name),
        isAuto: track.kind === 'asr'
    })).filter((track) => track.code);
}

function extractCaptionName(name) {
    if (!name) return null;
    if (typeof name.simpleText === 'string') return name.simpleText.trim();
    if (Array.isArray(name.runs)) {
        return name.runs.map((run) => run.text).join('').trim();
    }
    return null;
}

function buildLanguageOptions(captionTracks) {
    const byCode = new Map();
    captionTracks.forEach((track) => {
        const code = track.code;
        if (!code) return;
        const existing = byCode.get(code);
        if (!existing) {
            byCode.set(code, {
                code,
                name: track.name || code,
                isAuto: track.isAuto
            });
            return;
        }
        if (existing.isAuto && !track.isAuto) {
            existing.isAuto = false;
            if (track.name) existing.name = track.name;
        }
    });

    return Array.from(byCode.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function getYtDlpDownloadUrl() {
    if (process.platform === 'win32') {
        return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
    }
    if (process.platform === 'darwin') {
        return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
    }
    return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
}

function findExecutableInPath(names) {
    const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
    const candidateNames = Array.isArray(names) ? names : [names];
    for (const entry of pathEntries) {
        for (const name of candidateNames) {
            const fullPath = path.join(entry, name);
            if (fs.existsSync(fullPath)) return fullPath;
        }
    }
    return null;
}

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const maxRedirects = 5;

        const request = (currentUrl, redirectsLeft) => {
            const req = https.get(currentUrl, (res) => {
                const status = res.statusCode || 0;

                if ([301, 302, 303, 307, 308].includes(status)) {
                    if (!res.headers.location) {
                        res.resume();
                        return reject(new Error('Download redirect missing location header.'));
                    }
                    if (redirectsLeft <= 0) {
                        res.resume();
                        return reject(new Error('Too many redirects while downloading yt-dlp.'));
                    }
                    const nextUrl = new URL(res.headers.location, currentUrl).toString();
                    res.resume();
                    return request(nextUrl, redirectsLeft - 1);
                }

                if (status !== 200) {
                    res.resume();
                    return reject(new Error(`Failed to download yt-dlp (status ${status}).`));
                }

                const file = fs.createWriteStream(destPath);
                res.pipe(file);
                file.on('finish', () => file.close(resolve));
                file.on('error', (err) => {
                    try {
                        fs.unlinkSync(destPath);
                    } catch (e) {
                        console.error('Failed to delete temporary download file:', destPath, e);
                    }
                    reject(err);
                });
            });

            req.on('error', reject);
        };

        request(url, maxRedirects);
    });
}
