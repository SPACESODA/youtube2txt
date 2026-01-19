const test = require('node:test');
const assert = require('node:assert/strict');

const { _test } = require('../server');

test('parseVTT extracts text cues and strips tags', () => {
    const vtt = [
        'WEBVTT',
        '',
        '00:00:00.000 --> 00:00:02.000',
        'Hello <c>world</c>',
        '',
        '00:00:02.500 --> 00:00:04.000',
        'Line 1',
        'Line 2'
    ].join('\n');

    const result = _test.parseVTT(vtt);
    assert.deepEqual(result, [
        { text: 'Hello world' },
        { text: 'Line 1\nLine 2' }
    ]);
});

test('sanitizeTranscriptText removes timestamp tags and decodes entities', () => {
    const input = 'Hi &amp; welcome <00:00:01.000>';
    const result = _test.sanitizeTranscriptText(input);
    assert.equal(result, 'Hi & welcome');
});

test('buildLanguageOptions prefers manual captions over auto', () => {
    const tracks = [
        { code: 'en', name: 'English (auto)', isAuto: true },
        { code: 'en', name: 'English', isAuto: false },
        { code: 'es', name: 'Spanish', isAuto: true }
    ];
    const result = _test.buildLanguageOptions(tracks);
    assert.deepEqual(result, [
        { code: 'en', name: 'English', isAuto: false },
        { code: 'es', name: 'Spanish', isAuto: true }
    ]);
});
