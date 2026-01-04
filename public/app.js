
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

        const transcript = await fetchTranscript(videoId);
        displayTranscript(transcript);

    } catch (err) {
        console.error(err);
        showError(err.message);
    } finally {
        setLoading(false);
    }
}

async function fetchTranscript(videoId) {
    // 1. Fetch the video page via CORS proxy
    // We use AllOrigins or corsproxy.io. corsproxy.io is often faster/more reliable for this.
    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);

    const response = await fetch(proxyUrl);
    if (!response.ok) {
        throw new Error('Failed to fetch video page');
    }
    const html = await response.text();

    // 2. Extract Captions URL
    const captionsUrl = extractCaptionsUrl(html);
    if (!captionsUrl) {
        if (html.includes('class="g-recaptcha"')) {
            throw new Error('YouTube is blocking this request (Bot detected). Please try again later.');
        }
        if (!html.includes('ytInitialPlayerResponse')) {
            throw new Error('Could not parse YouTube page. The video might be private or unavailable.');
        }
        throw new Error('No transcript found for this video (or it is disabled).');
    }

    // 3. Fetch the actual transcript XML via CORS proxy
    const proxyTranscriptUrl = 'https://corsproxy.io/?' + encodeURIComponent(captionsUrl);
    const transcriptResponse = await fetch(proxyTranscriptUrl);
    if (!transcriptResponse.ok) {
        throw new Error('Failed to fetch transcript data');
    }
    const transcriptXml = await transcriptResponse.text();

    // 4. Parse XML
    const transcript = parseTranscript(transcriptXml);
    if (!transcript || transcript.length === 0) {
        throw new Error('Transcript was empty after parsing.');
    }

    return transcript;
}

function extractCaptionsUrl(html) {
    try {
        let playerResponse = null;
        const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);

        if (playerResponseMatch) {
            playerResponse = JSON.parse(playerResponseMatch[1]);
        }

        if (!playerResponse) {
            const splitHtml = html.split('"captions":');
            if (splitHtml.length > 1) {
                const potentialJson = splitHtml[1].split(',"videoDetails')[0].replace(/\n/g, '');
                playerResponse = { captions: JSON.parse(potentialJson) };
            }
        }

        if (!playerResponse) return null;

        const captions = playerResponse.captions ||
            (playerResponse.playerCaptionsTracklistRenderer ? { playerCaptionsTracklistRenderer: playerResponse.playerCaptionsTracklistRenderer } : null);

        if (!captions || !captions.playerCaptionsTracklistRenderer) return null;

        const captionTracks = captions.playerCaptionsTracklistRenderer.captionTracks;
        if (!captionTracks || captionTracks.length === 0) return null;

        // Sort by priority: English -> Auto -> First
        captionTracks.sort((a, b) => {
            if (a.languageCode === 'en') return -1;
            if (b.languageCode === 'en') return 1;
            return 0;
        });

        return captionTracks[0].baseUrl;
    } catch (e) {
        console.error('Error parsing captions JSON:', e);
        return null;
    }
}

function parseTranscript(xml) {
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
