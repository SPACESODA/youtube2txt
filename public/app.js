// Frontend logic for youtube2txt: UI wiring, transcript fetch, caching, and export actions.

const videoUrlInput = document.getElementById('videoUrl');
const fetchBtn = document.getElementById('fetchBtn');
const btnText = fetchBtn.querySelector('.btn-text');
const spinner = fetchBtn.querySelector('.spinner');
const resultContainer = document.getElementById('resultContainer');
const transcriptContent = document.getElementById('transcriptContent');
const errorMsg = document.getElementById('errorMsg');
const localReminder = document.getElementById('localReminder');
const localReminderTitle = document.getElementById('localReminderTitle');
const localReminderMessage = document.getElementById('localReminderMessage');
const localReminderAction = document.getElementById('localReminderAction');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');

const customSelect = document.getElementById('customSelect');
const selectTrigger = document.getElementById('selectTrigger');
const selectedLabel = document.getElementById('selectedLabel');
const selectOptions = document.getElementById('selectOptions');
const langSpinner = document.getElementById('langSpinner');

const urlParams = new URLSearchParams(window.location.search);
const rawApiBase = urlParams.get('apiBase');
const apiBase = (() => {
    return rawApiBase ? rawApiBase.replace(/\/+$/, '') : '';
})();
const hasApiBaseValue = typeof rawApiBase === 'string' && rawApiBase.trim() !== '';

if (
    window.location.hostname === 'spacesoda.github.io' &&
    (window.location.pathname === '/youtube2txt/' || window.location.pathname === '/youtube2txt') &&
    !hasApiBaseValue
) {
    const redirectUrl = new URL(window.location.href);
    redirectUrl.searchParams.set('apiBase', 'http://localhost:3000');
    window.location.replace(redirectUrl.toString());
}

let lastLangVideoId = '';
let isFetching = false;
let lastFetchedKey = '';
let hasUserSelectedLang = false;
let activeController = null;
let activeRequestKey = '';
let currentVideoId = ''; // Global to hold current ID
let currentVideoTitle = ''; // Store video title for downloads
let currentSelectedLang = 'auto';
let currentDefaultLang = '';
const localReminderDefaults = {
    title: localReminderTitle ? localReminderTitle.innerText : '',
    message: localReminderMessage ? localReminderMessage.innerText : '',
    actionHtml: localReminderAction ? localReminderAction.innerHTML : ''
};

function isLocalApiBase(value) {
    if (!value) return true;
    try {
        const url = new URL(value, window.location.origin);
        return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    } catch (e) {
        return true;
    }
}

const apiBaseIsLocal = isLocalApiBase(apiBase);

// Show reminder on GitHub Pages when no API base is provided.
if (window.location.hostname === 'spacesoda.github.io' && !hasApiBaseValue) {
    if (localReminder) localReminder.classList.remove('hidden');
}

function showLocalReminder(variant = 'local') {
    if (localReminder) localReminder.classList.remove('hidden');
    if (!localReminderTitle || !localReminderMessage || !localReminderAction) return;
    if (variant === 'remote') {
        localReminderTitle.innerText = 'Server Not Reachable';
        localReminderMessage.innerText = apiBase
            ? `Server not reachable at ${apiBase}. Check that it is running and accessible.`
            : 'Server not reachable. Check that it is running and accessible.';
        localReminderAction.innerHTML = localReminderDefaults.actionHtml;
        return;
    }
    localReminderTitle.innerText = localReminderDefaults.title;
    localReminderMessage.innerText = localReminderDefaults.message;
    localReminderAction.innerHTML = localReminderDefaults.actionHtml;
}

async function probeLocalServer() {
    if (!apiBaseIsLocal || !hasApiBaseValue) return;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    try {
        await fetch(`${apiBase}/`, { signal: controller.signal });
    } catch (e) {
        showLocalReminder('local');
    } finally {
        clearTimeout(timeoutId);
    }
}

if (window.location.hostname === 'spacesoda.github.io') {
    probeLocalServer();
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
        currentDefaultLang = '';
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
    const originalText = copyBtn.innerText;
    navigator.clipboard.writeText(text).then(() => {
        copyBtn.innerText = 'Copied!';
        setTimeout(() => copyBtn.innerText = originalText, 2000);
    }).catch((err) => {
        console.error('Failed to copy text to clipboard:', err);
        copyBtn.innerText = 'Copy failed';
        setTimeout(() => copyBtn.innerText = originalText, 2000);
    });
});

downloadBtn.addEventListener('click', () => {
    const text = transcriptContent.innerText;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const langCode = currentSelectedLang && currentSelectedLang !== 'auto'
        ? currentSelectedLang
        : (currentDefaultLang || 'auto');
    a.download = currentVideoId
        ? `youtube-${currentVideoId}.${langCode}.txt`
        : 'transcript.txt';
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
        currentVideoId = videoId; // Ensure download filename works even on cache hit.
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
        console.log(`Requesting transcript for ${videoId} from local server...`);
        
        // Start language loading in background
        if (videoId !== lastLangVideoId) {
            loadLanguages(videoId);
        }

        // Transcript fetch from API (local by default)
        const langQuery = langValue && langValue !== 'auto' ? `&lang=${encodeURIComponent(langValue)}` : '';
        const response = await fetch(`${apiBase}/transcript?videoId=${encodeURIComponent(videoId)}${langQuery}`, {
            signal: activeController.signal
        });

        if (!response.ok) {
            if (response.status === 404 && !window.location.hostname.includes('localhost')) {
                const reminderVariant = apiBaseIsLocal ? 'local' : 'remote';
                showLocalReminder(reminderVariant);
                if (apiBaseIsLocal) {
                    throw new Error("Local server not found. Please run 'npm start' and append ?apiBase=http://localhost:3000 to the end of the URL.");
                }
                throw new Error(apiBase
                    ? `Server not found at ${apiBase}. Check that it is running and accessible.`
                    : 'Server not found. Check that it is running and accessible.');
            }
            const errData = await response.json().catch((jsonErr) => {
                console.error('Failed to parse error response as JSON:', jsonErr);
                return {
                    error: `Server Error: ${response.status} (invalid response format)`,
                    details: jsonErr && jsonErr.message ? jsonErr.message : String(jsonErr)
                };
            });
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
            const reminderVariant = apiBaseIsLocal ? 'local' : 'remote';
            showLocalReminder(reminderVariant);
            msg = apiBaseIsLocal
                ? (apiBase ? `Server not reachable at ${apiBase}. Check that it is running and accessible.` : "Local server not connected. Please run 'npm start'.")
                : (apiBase ? `Server not reachable at ${apiBase}. Check that it is running and accessible.` : 'Server not reachable. Check that it is running and accessible.');
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
const CACHE_CONFIG = {
    TTL_MS: 10 * 60 * 1000 // 10 minutes
};
const CACHE_TTL = CACHE_CONFIG.TTL_MS;

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
    // First collect relevant keys to avoid issues when localStorage is mutated during iteration
    const keysToCheck = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CACHE_PREFIX)) {
            keysToCheck.push(key);
        }
    }

    // Now process the collected keys safely
    for (const key of keysToCheck) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) {
                localStorage.removeItem(key);
                continue;
            }
            const payload = JSON.parse(raw);
            if (!payload || typeof payload.timestamp !== 'number' || (now - payload.timestamp > CACHE_TTL)) {
                localStorage.removeItem(key);
            }
        } catch (e) {
            localStorage.removeItem(key);
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

function formatTranscript(transcript) {
    const lines = [];
    (transcript || []).forEach((item) => {
        if (!item || !item.text) return;
        const cueText = String(item.text).replace(/\r\n?/g, '\n').trim();
        if (!cueText) return;
        const firstLine = cueText.split('\n').find(line => line.trim()) || '';
        const isSpeakerCue = firstLine.startsWith('>>');
        if (isSpeakerCue && lines.length > 0) {
            lines.push('');
        }
        lines.push(cueText);
    });
    return lines.join('\n');
}

function displayTranscript(transcript) {
    const formattedText = formatTranscript(transcript);
    // Prepend title to the UI content (so it can be copied easily)
    const headerLines = [];
    if (currentVideoTitle) headerLines.push(currentVideoTitle);
    if (currentVideoId) headerLines.push(`https://www.youtube.com/watch?v=${currentVideoId}`);
    const headerText = headerLines.join('\n');
    const contentWithTitle = headerText ? `${headerText}\n\n${formattedText}` : formattedText;
    const footer = '\n\n---\n\nTranscript extracted by youtube2txt\nhttps://github.com/SPACESODA/youtube2txt/\n';
    transcriptContent.innerText = contentWithTitle + footer;
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
    currentDefaultLang = defaultLang || '';
    
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
