import { YoutubeTranscript } from 'youtube-transcript';

export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    const videoId = url.searchParams.get('videoId');

    if (!videoId) {
        return new Response(JSON.stringify({ error: 'Missing videoId' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        // Fetch transcript. We do not enforce 'lang' to allow the library to find the best available matching transcript.
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);

        return new Response(JSON.stringify({ transcript }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Transcript fetch error:', error);

        let status = 500;
        let message = error.message || 'Failed to fetch transcript';

        if (message.includes('Transcript is disabled')) {
            status = 404;
            message = 'Transcripts are disabled or unavailable for this video.';
        }

        return new Response(JSON.stringify({ error: message }), {
            status: status,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
