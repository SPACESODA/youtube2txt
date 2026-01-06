const videoUrlInput = document.getElementById('videoUrl');
const fetchBtn = document.getElementById('fetchBtn');
const btnText = fetchBtn.querySelector('.btn-text');
const spinner = fetchBtn.querySelector('.spinner');
const resultContainer = document.getElementById('resultContainer');
const transcriptContent = document.getElementById('transcriptContent');
const errorMsg = document.getElementById('errorMsg');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');

const customSelect = document.getElementById('customSelect');
const selectTrigger = document.getElementById('selectTrigger');
const selectedLabel = document.getElementById('selectedLabel');
const selectOptions = document.getElementById('selectOptions');
const langSpinner = document.getElementById('langSpinner');

const urlParams = new URLSearchParams(window.location.search);
const apiBase = (() => {
    const base = urlParams.get('apiBase');
    return base ? base.replace(/\/+$/, '') : '';
})();
const langParam = (() => {
    const lang = urlParams.get('lang');
    return lang ? lang.trim() : '';
})();

let lastLangVideoId = '';
let isFetching = false;
let lastFetchedKey = '';
let hasUserSelectedLang = false;
let activeController = null;
let activeRequestKey = '';
let currentVideoId = ''; // Global to hold current ID
let currentVideoTitle = ''; // Store video title for downloads
let currentSelectedLang = 'auto';

// Show reminder if not on localhost and no custom API base is provided
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && !apiBase) {
    const localReminder = document.getElementById('localReminder');
    if (localReminder) localReminder.classList.remove('hidden');
}

fetchBtn.addEventListener('click', handleFetch);
videoUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleFetch();
});

videoUrlInput.addEventListener('input', () => {
    const videoId = extractVideoId(videoUrlInput.value);
    if (videoId !== lastLangVideoId) {
        // Reset UI when URL changes
        if (customSelect) customSelect.classList.add('hidden');
        fetchBtn.classList.remove('hidden');
        if (langSpinner) langSpinner.classList.add('hidden');
        resetUI();
        lastLangVideoId = '';
        lastFetchedKey = '';
        activeRequestKey = '';
        hasUserSelectedLang = false;
        currentSelectedLang = 'auto';
        if (selectedLabel) selectedLabel.innerText = 'Auto';
        if (activeController) {
            activeController.abort();
            activeController = null;
            isFetching = false;
            setLoading(false);
        }
    }
});

// Custom Select Interaction
if (selectTrigger) {
    selectTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        customSelect.classList.toggle('open');
        selectOptions.classList.toggle('hidden');
    });
}

document.addEventListener('click', () => {
    if (customSelect) {
        customSelect.classList.remove('open');
        selectOptions.classList.add('hidden');
    }
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
    a.download = currentVideoId ? `youtube_${currentVideoId}.txt` : 'transcript.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

async function handleFetch() {
    const url = videoUrlInput.value.trim();
    if (!url) return;

    let requestKey = '';
    try {
        const videoId = extractVideoId(url);
        if (!videoId) throw new Error('Please enter a valid YouTube video URL.');

        const langValue = currentSelectedLang;
        requestKey = `${videoId}|${langValue || 'auto'}`;

        // CHECK CACHE
        const cached = getCachedTranscript(videoId, langValue);
        if (cached) {
            console.log(`[Cache] Using cached transcript for ${videoId} (${langValue})`);
            currentVideoTitle = cached.title;
            displayTranscript(cached.segments);
            lastFetchedKey = requestKey;
            setLoading(false);
            isFetching = false;
            activeController = null;
            
            // Still load languages in background to update the dropdown if needed
            if (videoId !== lastLangVideoId) {
                loadLanguages(videoId);
            }
            return;
        }

        resetUI();
        setLoading(true);
        isFetching = true;
        activeRequestKey = requestKey;
        activeController = new AbortController();

        currentVideoId = videoId; // Save for download filename
        console.log(`Requesting transcript for ${videoId} from local server...`);
        
        // Start language loading in background
        if (videoId !== lastLangVideoId) {
            loadLanguages(videoId);
        }

        // DIRECT LOCAL SERVER FETCH
        const langQuery = langValue && langValue !== 'auto' ? `&lang=${encodeURIComponent(langValue)}` : '';
        const response = await fetch(`${apiBase}/transcript?videoId=${encodeURIComponent(videoId)}${langQuery}`, {
            signal: activeController.signal
        });

        if (!response.ok) {
            if (response.status === 404 && !window.location.hostname.includes('localhost')) {
                throw new Error("Local server not found. Please run 'npm start' on your computer and add this to the URL: ?apiBase=http://localhost:3000");
            }
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Server Error: ${response.status}`);
        }

        const data = await response.json();
        
        // Identity check: Is this still the request the user wants?
        if (activeRequestKey !== requestKey) {
            return;
        }

        const transcript = data.segments;
        currentVideoTitle = data.title;

        if (!transcript || transcript.length === 0) {
            throw new Error('No transcript available for this video.');
        }

        // SAVE TO CACHE (Confirmed completed)
        saveToCache(videoId, langValue, {
            title: currentVideoTitle,
            segments: transcript
        });

        displayTranscript(transcript);
        lastFetchedKey = requestKey;

    } catch (err) {
        if (err.name === 'AbortError' || activeRequestKey !== requestKey) {
            return;
        }
        console.error('Fetch failed:', err);
        let msg = err.message;

        // Friendly error for connection refused (server not running)
        const isNetworkError = err.name === 'TypeError' && (msg === 'Failed to fetch' || msg.includes('NetworkError'));
        if (isNetworkError) {
            msg = apiBase
                ? `Server not reachable at ${apiBase}. Check that it is running and accessible.`
                : "Local server not connected. Please run 'npm start'.";
        }

        showError(msg);
    } finally {
        if (activeRequestKey === requestKey) {
            setLoading(false);
            isFetching = false;
            activeController = null;
        }
    }
}

// --- Caching Logic ---
const CACHE_PREFIX = 'ts_cache_';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function saveToCache(videoId, lang, data) {
    const key = `${CACHE_PREFIX}${videoId}_${lang || 'auto'}`;
    const payload = {
        ...data,
        timestamp: Date.now()
    };
    try {
        localStorage.setItem(key, JSON.stringify(payload));
        cleanupCache();
    } catch (e) {
        console.warn('[Cache] Storage full or failed:', e);
    }
}

function getCachedTranscript(videoId, lang) {
    const key = `${CACHE_PREFIX}${videoId}_${lang || 'auto'}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    try {
        const payload = JSON.parse(raw);
        const age = Date.now() - payload.timestamp;
        if (age > CACHE_TTL) {
            localStorage.removeItem(key);
            return null;
        }
        return payload;
    } catch (e) {
        return null;
    }
}

function cleanupCache() {
    const now = Date.now();
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CACHE_PREFIX)) {
            try {
                const payload = JSON.parse(localStorage.getItem(key));
                if (now - payload.timestamp > CACHE_TTL) {
                    localStorage.removeItem(key);
                }
            } catch (e) {
                localStorage.removeItem(key);
            }
        }
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

    if (langSpinner) {
        // Show spinner if loading and the custom dropdown is visible
        const showSpinner = isLoading && customSelect && !customSelect.classList.contains('hidden');
        langSpinner.classList.toggle('hidden', !showSpinner);
    }
}

function showError(msg) {
    errorMsg.innerText = msg;
    errorMsg.classList.remove('hidden');
}

async function loadLanguages(videoId) {
    const isNewVideo = videoId !== lastLangVideoId;
    lastLangVideoId = videoId;
    if (isNewVideo) {
        hasUserSelectedLang = false;
        lastFetchedKey = '';
    }
    
    // Clear custom select options
    if (selectOptions) {
        selectOptions.innerHTML = '<div class="select-option">Loading...</div>';
    }

    try {
        const response = await fetch(`${apiBase}/languages?videoId=${encodeURIComponent(videoId)}`);
        if (!response.ok) return;
        const data = await response.json();
        const languages = Array.isArray(data.languages) ? data.languages : [];
        const defaultLang = typeof data.defaultLang === 'string' ? data.defaultLang : '';
        setLanguageOptions(languages, defaultLang);
    } catch (err) {
        // Ignore language load errors
    }
}

function setLanguageOptions(languages, defaultLang) {
    if (!selectOptions) return;
    
    selectOptions.innerHTML = '';
    
    const filteredLanguages = defaultLang
        ? languages.filter((lang) => lang.code !== defaultLang)
        : languages;
    
    // Add Auto/Default option
    const autoLabel = defaultLang || 'Auto';
    addOption(autoLabel, 'auto', currentSelectedLang === 'auto');

    filteredLanguages.forEach((lang) => {
        const label = lang.code || lang.name || '';
        addOption(label, lang.code, currentSelectedLang === lang.code);
    });

    // UI/UX: Switch button to dropdown only if more than 1 language
    if (languages.length > 1) {
        if (customSelect) customSelect.classList.remove('hidden');
        fetchBtn.classList.add('hidden');
        // Update label to current code if auto is active
        if (currentSelectedLang === 'auto' && defaultLang) {
            selectedLabel.innerText = defaultLang;
        }
        // Ensure spinner is visible if we are currently fetching
        if (langSpinner && isFetching) {
            langSpinner.classList.remove('hidden');
        }
    } else {
        if (customSelect) customSelect.classList.add('hidden');
        fetchBtn.classList.remove('hidden');
    }
}

function addOption(label, value, isSelected) {
    const div = document.createElement('div');
    div.className = 'select-option' + (isSelected ? ' selected' : '');
    div.setAttribute('data-umami-event', 'yt | Select Transcript Language');
    div.innerText = label;
    div.addEventListener('click', (e) => {
        e.stopPropagation();
        currentSelectedLang = value;
        selectedLabel.innerText = label;
        hasUserSelectedLang = true;
        
        // Update selection UI
        Array.from(selectOptions.children).forEach(opt => opt.classList.remove('selected'));
        div.classList.add('selected');
        
        // Close dropdown
        customSelect.classList.remove('open');
        selectOptions.classList.add('hidden');
        
        // Trigger fetch
        handleFetch();
    });
    selectOptions.appendChild(div);
}
