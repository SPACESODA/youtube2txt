
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
    // Strategy 1: Piped API Rotation (JSON API)
    // Expanded list of reliable public instances
    const pipedInstances = [
        'https://pipedapi.kavin.rocks',
        'https://api.piped.io',
        'https://pipedapi.drgns.space',
        'https://api.piped.privacy.com.de',
        'https://pipedapi.tokhmi.xyz',
        'https://piped-api.lunar.icu',
        'https://pa.il.ax'
    ];

    for (const base of pipedInstances) {
        try {
            console.log(`Attempting Piped API via: ${base}...`);
            return await fetchViaPiped(videoId, base);
        } catch (e) {
            console.warn(`Piped (${base}) failed:`, e.message);
        }
    }

    // Strategy 2: Invidious API Rotation
    const invidiousInstances = [
        'https://inv.tux.pizza',
        'https://invidious.drgns.space',
        'https://vid.puffyan.us',
        'https://yt.artemislena.eu',
        'https://invidious.projectsegfau.lt',
        'https://inv.nadeko.net'
    ];

    for (const base of invidiousInstances) {
        try {
            console.log(`Attempting Invidious API via: ${base}...`);
            return await fetchViaInvidious(videoId, base);
        } catch (e) {
            console.warn(`Invidious (${base}) failed:`, e.message);
        }
    }

    // Strategy 3: Scraping via corsproxy.io (Last resort as it's often blocked)
    try {
        console.log('Attempting scraping via corsproxy.io...');
        return await fetchViaScraping(videoId, 'https://corsproxy.io/?');
    } catch (e) {
        console.warn('Scraping (corsproxy.io) failed:', e.message);
    }

    // Strategy 4: Scraping via allorigins.win
    try {
        console.log('Attempting scraping via allorigins.win...');
        return await fetchViaScraping(videoId, 'https://api.allorigins.win/raw?url=');
    } catch (e) {
        console.warn('Scraping (allorigins) failed:', e.message);
    }

    throw new Error('Could not fetch transcript. All 15+ methods/servers failed. YouTube is blocking everything.');
}

// --- METHOD: PIPED API ---

async function fetchViaPiped(videoId, baseUrl) {
    // Timeout of 5s to fail fast
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
        const resp = await fetch(`${baseUrl}/streams/${videoId}`, { signal: controller.signal });
        if (!resp.ok) throw new Error(`API Status ${resp.status}`);
        const data = await resp.json();

        const subtitles = data.subtitles;
        if (!subtitles || !subtitles.length) throw new Error('No subtitles found');

        // Find English or first
        const track = subtitles.find(s => s.code === 'en') || subtitles[0];

        // Piped subtitle URLs might also need CORS fetching if cross-domain issues arise, 
        // but typically Piped sets CORS headers correctly.
        const subResp = await fetch(track.url);
        if (!subResp.ok) throw new Error('Failed to fetch subtitle text');

        const text = await subResp.text();
        return parseSubtitles(text);
    } finally {
        clearTimeout(timeout);
    }
}

// --- METHOD: INVIDIOUS API ---

async function fetchViaInvidious(videoId, baseUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
        const resp = await fetch(`${baseUrl}/api/v1/captions/${videoId}`, { signal: controller.signal });
        if (!resp.ok) throw new Error(`API Status ${resp.status}`);

        const data = await resp.json();
        if (!data.captions || !data.captions.length) throw new Error('No captions in response');

        const track = data.captions.find(c => c.languageCode === 'en') || data.captions[0];
        const trackUrl = `${baseUrl}${track.url}`;

        const subResp = await fetch(trackUrl);
        if (!subResp.ok) throw new Error('Failed to fetch caption content');
        const text = await subResp.text();
        return parseSubtitles(text);
    } finally {
        clearTimeout(timeout);
    }
}

// --- METHOD: SCRAPING HELPERS ---

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

    return parseTranscriptXML(xmlText);
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
        tracks.sort((a, b) => (a.languageCode === 'en' ? -1 : b.languageCode === 'en' ? 1 : 0));
        return tracks[0].baseUrl;
    } catch (e) {
        return null;
    }
}

// --- PARSING UTILS ---

function parseSubtitles(text) {
    if (text.trim().startsWith('WEBVTT') || text.includes('-->')) {
        return parseVTT(text);
    }
    // Try JSON
    try {
        const json = JSON.parse(text);
        if (Array.isArray(json)) return json.map(i => ({
            start: i.start,
            duration: i.duration,
            text: i.text
        }));
        if (json.events) return json.events.map(e => ({
            start: e.tStartMs / 1000,
            duration: e.dDurationMs / 1000,
            text: e.segs ? e.segs.map(s => s.utf8).join('') : ''
        })).filter(i => i.text);
    } catch (e) { }

    // Fallback: assume raw text or unknown format, try VTT parser anyway
    return parseVTT(text);
}

function parseVTT(vttText) {
    const lines = vttText.split('\n');
    const items = [];
    let i = 0;
    if (lines[0].startsWith('WEBVTT')) i = 1;

    for (; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (line.includes('-->')) {
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
