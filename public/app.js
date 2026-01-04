
const videoUrlInput = document.getElementById('videoUrl');
const fetchBtn = document.getElementById('fetchBtn');
const btnText = fetchBtn.querySelector('.btn-text');
const spinner = fetchBtn.querySelector('.spinner');
const resultContainer = document.getElementById('resultContainer');
const transcriptContent = document.getElementById('transcriptContent');
const errorMsg = document.getElementById('errorMsg');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');

fetchBtn.addEventListener('click', handleFetch);
videoUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleFetch();
});

copyBtn.addEventListener('click', () => {
    const text = transcriptContent.innerText;
    navigator.clipboard.writeText(text).then(() => {
        const originalText = copyBtn.innerText;
        copyBtn.innerText = 'Copied!';
        setTimeout(() => copyBtn.innerText = originalText, 2000);
    });
});

downloadBtn.addEventListener('click', () => {
    const text = transcriptContent.innerText;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcript.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

async function handleFetch() {
    const url = videoUrlInput.value.trim();
    if (!url) return;

    resetUI();
    setLoading(true);

    try {
        const videoId = extractVideoId(url);
        if (!videoId) throw new Error('Invalid YouTube URL');

        console.log(`Starting transcript fetch for Video ID: ${videoId}`);
        const transcript = await fetchTranscriptWaterfall(videoId);
        displayTranscript(transcript);

    } catch (err) {
        console.error('All fetch methods failed:', err);
        showError(err.message);
    } finally {
        setLoading(false);
    }
}

// --- WATERFALL STRATEGY ---

async function fetchTranscriptWaterfall(videoId) {
    // Strategy 1: Default Scraping via corsproxy.io (Fastest)
    try {
        console.log('Attempt 1: Scraping via corsproxy.io...');
        return await fetchViaScraping(videoId, 'https://corsproxy.io/?');
    } catch (e) {
        console.warn('Attempt 1 failed:', e.message);
    }

    // Strategy 2: Scraping via allorigins.win (Backup Proxy)
    try {
        console.log('Attempt 2: Scraping via allorigins.win...');
        return await fetchViaScraping(videoId, 'https://api.allorigins.win/raw?url=');
    } catch (e) {
        console.warn('Attempt 2 failed:', e.message);
    }

    // Strategy 3: Piped API (Public Instance)
    try {
        console.log('Attempt 3: Piped API...');
        return await fetchViaPiped(videoId);
    } catch (e) {
        console.warn('Attempt 3 failed:', e.message);
    }

    // Strategy 4: Invidious API (Public Instance)
    try {
        console.log('Attempt 4: Invidious API...');
        return await fetchViaInvidious(videoId);
    } catch (e) {
        console.warn('Attempt 4 failed:', e.message);
    }

    throw new Error('Could not fetch transcript. All methods failed (blocked or unavailable).');
}

// --- METHOD 1 & 2: SCRAPING HELPERS ---

async function fetchViaScraping(videoId, proxyBase) {
    const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const proxyUrl = proxyBase + encodeURIComponent(targetUrl);

    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`Proxy response status: ${response.status}`);
    const html = await response.text();

    const captionsUrl = extractCaptionsUrl(html);
    if (!captionsUrl) throw new Error('No captions found in HTML');

    // Fetch XML
    const xmlProxyUrl = proxyBase + encodeURIComponent(captionsUrl);
    const xmlResp = await fetch(xmlProxyUrl);
    if (!xmlResp.ok) throw new Error('Failed to fetch caption XML');
    const xmlText = await xmlResp.text();

    const transcript = parseTranscriptXML(xmlText);
    if (!transcript.length) throw new Error('Empty transcript after parsing');

    return transcript;
}

function extractCaptionsUrl(html) {
    try {
        let playerResponse = null;
        const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
        if (match) playerResponse = JSON.parse(match[1]);

        if (!playerResponse) {
            const split = html.split('"captions":');
            if (split.length > 1) {
                const json = split[1].split(',"videoDetails')[0].replace(/\n/g, '');
                playerResponse = { captions: JSON.parse(json) };
            }
        }

        if (!playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) return null;

        const tracks = playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
        // Prioritize English
        tracks.sort((a, b) => (a.languageCode === 'en' ? -1 : b.languageCode === 'en' ? 1 : 0));
        return tracks[0].baseUrl;
    } catch (e) {
        return null;
    }
}

function parseTranscriptXML(xml) {
    const regex = /<text start="([\d.]+)" dur="([\d.]+)".*?>(.*?)<\/text>/g;
    const matches = [];
    let match;
    while ((match = regex.exec(xml)) !== null) {
        matches.push({
            start: parseFloat(match[1]),
            duration: parseFloat(match[2]),
            text: decodeHTMLEntities(match[3]),
        });
    }
    return matches;
}

// --- METHOD 3: PIPED API ---

async function fetchViaPiped(videoId) {
    // Piped instances: https://github.com/TeamPiped/Piped/wiki/Instances
    // Using a reliable public instance
    const resp = await fetch(`https://pipedapi.kavin.rocks/streams/${videoId}`);
    if (!resp.ok) throw new Error('Piped API error');
    const data = await resp.json();

    const subtitles = data.subtitles;
    if (!subtitles || !subtitles.length) throw new Error('No subtitles in Piped response');

    // Find English or first
    const track = subtitles.find(s => s.code === 'en') || subtitles[0];

    // Fetch the actual subtitle content (JSON or VTT, usually format is accessible)
    // Piped returns URL to .vtt or .json
    const subResp = await fetch(track.url);
    if (!subResp.ok) throw new Error('Failed to fetch subtitle text from Piped');

    // Piped VTT/JSON handling might vary, but let's assume it returns text we can parse 
    // actually Piped usually returns WebVTT. Let's try to parse simple VTT.
    const text = await subResp.text();
    return parseVTT(text);
}

// --- METHOD 4: INVIDIOUS API ---

async function fetchViaInvidious(videoId) {
    // Invidious instances: https://api.invidious.io/
    const instance = 'https://inv.tux.pizza'; // Popular instance
    const resp = await fetch(`${instance}/api/v1/captions/${videoId}`);
    if (!resp.ok) throw new Error('Invidious API error');

    const data = await resp.json();
    // Invidious returns list of captions
    if (!data.captions || !data.captions.length) throw new Error('No captions in Invidious response');

    const track = data.captions.find(c => c.languageCode === 'en') || data.captions[0];
    const trackUrl = `${instance}${track.url}`;

    const subResp = await fetch(trackUrl);
    if (!subResp.ok) throw new Error('Failed to fetch caption content from Invidious');
    const text = await subResp.text();

    // Invidious usually returns WebVTT or custom JSON depending on endpoint.
    // The main endpoint /api/v1/captions/{id} returns list. 
    // The specific url typically returns VTT.
    return parseVTT(text);
}

// --- UTILS ---

function parseVTT(vttText) {
    // Basic WebVTT parser
    const lines = vttText.split('\n');
    const items = [];
    let currentHash = {};

    // Very simple parser for robustness
    // Skip header
    let i = 0;
    if (lines[0].startsWith('WEBVTT')) i = 1;

    for (; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Time line: 00:00:00.000 --> 00:00:05.000
        if (line.includes('-->')) {
            // It's a timestamp
            // Next lines are text until empty
            let text = '';
            i++;
            while (i < lines.length && lines[i].trim() !== '') {
                text += lines[i].trim() + ' ';
                i++;
            }
            items.push({ text: text.trim() });
        }
    }
    return items;
}

function decodeHTMLEntities(text) {
    const txt = document.createElement("textarea");
    txt.innerHTML = text;
    return txt.value;
}

function extractVideoId(url) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length == 11) ? match[7] : false;
}

function displayTranscript(transcript) {
    const formattedText = transcript.map(item => item.text).join(' ');
    transcriptContent.innerText = formattedText;
    resultContainer.classList.remove('hidden');
}

function resetUI() {
    errorMsg.classList.add('hidden');
    resultContainer.classList.add('hidden');
    transcriptContent.innerText = '';
}

function setLoading(isLoading) {
    fetchBtn.disabled = isLoading;
    if (isLoading) {
        btnText.classList.add('hidden');
        spinner.classList.remove('hidden');
    } else {
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
    }
}

function showError(msg) {
    errorMsg.innerText = msg;
    errorMsg.classList.remove('hidden');
}
