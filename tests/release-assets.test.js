const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const { platformFiles, expectedFiles, validateManifest, validateLocal } = require('../scripts/release-assets');

const version = '1.4.3';
function fixture(platform) {
    const files = platformFiles(platform, version).installers.map(url => ({ url, size: 4, sha512: Buffer.alloc(64).toString('base64') }));
    return { manifest: { version, files }, assets: files.map(file => ({ name: file.url, size: file.size })) };
}

for (const platform of ['darwin', 'win32', 'linux']) {
    test(`${platform}: accepts complete metadata and rejects broken update references`, () => {
        const { manifest, assets } = fixture(platform);
        validateManifest(platform, version, manifest, assets);
        assert.throws(() => validateManifest(platform, '1.4.4', manifest, assets), /version/);
        assert.throws(() => validateManifest(platform, version, manifest, assets.slice(1)), /Missing/);
        assert.throws(() => validateManifest(platform, version, { ...manifest, files: [{ ...manifest.files[0], sha512: 'bad' }] }, assets), /SHA-512/);
        assert.throws(() => validateManifest(platform, version, { ...manifest, files: [...manifest.files, manifest.files[0]] }, assets), /duplicate/);
    });
}

test('Mac updater metadata must include both architectures and both installer formats', () => {
    const { manifest, assets } = fixture('darwin');
    manifest.files.pop();
    assert.throws(() => validateManifest('darwin', version, manifest, assets), /omits installer/);
});

test('local validation detects corruption even when the installer size is unchanged', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube2txt-assets-test-'));
    try {
        const { manifest, assets } = fixture('win32');
        const installer = assets[0].name;
        manifest.files[0].sha512 = crypto.createHash('sha512').update('good').digest('base64');
        for (const name of expectedFiles('win32', version)) fs.writeFileSync(path.join(directory, name), 'good');
        fs.writeFileSync(path.join(directory, 'latest.yml'), yaml.dump(manifest));
        await validateLocal('win32', version, directory);
        fs.writeFileSync(path.join(directory, installer), 'evil');
        await assert.rejects(validateLocal('win32', version, directory), /SHA-512 mismatch/);
        fs.rmSync(path.join(directory, `${installer}.blockmap`));
        await assert.rejects(validateLocal('win32', version, directory), /ENOENT/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
