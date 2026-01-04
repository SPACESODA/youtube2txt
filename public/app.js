
const videoUrlInput = document.getElementById('videoUrl');
const fetchBtn = document.getElementById('fetchBtn');
const btnText = fetchBtn.querySelector('.btn-text');
const spinner = fetchBtn.querySelector('.spinner');
const resultContainer = document.getElementById('resultContainer');
const transcriptContent = document.getElementById('transcriptContent');
const errorMsg = document.getElementById('errorMsg');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');

let currentVideoId = ''; // Global to hold current ID
let currentVideoTitle = ''; // Store video title for downloads

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
    // Prepend title if available
    const outputText = currentVideoTitle ? `${currentVideoTitle}\n\n${text}` : text;
    const blob = new Blob([outputText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentVideoId ? `youtube_${currentVideoId}.txt` : 'transcript.txt';
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
        if (!videoId) throw new Error('Please enter a valid YouTube video URL.');

        currentVideoId = videoId; // Save for download filename
        console.log(`Requesting transcript for ${videoId} from local server...`);

        // DIRECT LOCAL SERVER FETCH
        const response = await fetch(`http://localhost:3000/transcript?videoId=${videoId}`);

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Server Error: ${response.status}`);
        }

        const data = await response.json();
        const transcript = data.segments;
        currentVideoTitle = data.title;

        if (!transcript || transcript.length === 0) {
            throw new Error('No transcript available for this video.');
        }

        displayTranscript(transcript);

    } catch (err) {
        console.error('Fetch failed:', err);
        let msg = err.message;

        // Friendly error for connection refused (server not running)
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
            msg = "Local server not connected. Please run 'npm start'.";
        }

        showError(msg);
    } finally {
        setLoading(false);
    }
}

function extractVideoId(url) {
    url = url.trim();

    // 1. Handle raw 11-character video IDs
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
        return url;
    }

    // 2. Patterns for various YouTube URL formats
    const patterns = [
        /(?:v=|\/)([a-zA-Z0-9_-]{11})(?:&|\?|$| )/, // watch?v=ID or /v/ID or shorts/ID
        /youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?|&|$| )/  // youtu.be/ID
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) return match[1];
    }

    return false;
}

function displayTranscript(transcript) {
    const formattedText = transcript.map(item => item.text).join(' ');
    // Prepend title to the UI content (so it can be copied easily)
    const contentWithTitle = currentVideoTitle ? `${currentVideoTitle}\n\n${formattedText}` : formattedText;
    transcriptContent.innerText = contentWithTitle;
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
