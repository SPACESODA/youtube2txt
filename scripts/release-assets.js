'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const yaml = require('js-yaml');

function platformFiles(platform, version) {
    const prefix = `youtube2txt-v${version}`;
    if (platform === 'darwin') {
        const installers = ['arm64', 'x64'].flatMap(arch =>
            ['dmg', 'zip'].map(ext => `${prefix}-mac-${arch}.${ext}`));
        return { manifest: 'latest-mac.yml', installers, blockmaps: installers.map(name => `${name}.blockmap`) };
    }
    if (platform === 'win32') {
        return { manifest: 'latest.yml', installers: [`${prefix}.exe`], blockmaps: [`${prefix}.exe.blockmap`] };
    }
    if (platform === 'linux') {
        return { manifest: 'latest-linux.yml', installers: [`${prefix}.AppImage`], blockmaps: [] };
    }
    throw new Error(`Unsupported release platform: ${platform}`);
}

function expectedFiles(platform, version) {
    const { manifest, installers, blockmaps } = platformFiles(platform, version);
    return [manifest, ...installers, ...blockmaps];
}

function validateManifest(platform, version, manifest, assets) {
    const { installers } = platformFiles(platform, version);
    if (manifest.version !== version) throw new Error(`Updater version does not match ${version}`);
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error('Updater manifest has no files');
    const seen = new Set();
    for (const file of manifest.files) {
        if (!installers.includes(file.url) || seen.has(file.url)) throw new Error(`Unexpected or duplicate updater file: ${file.url}`);
        seen.add(file.url);
        const asset = assets.find(asset => asset.name === file.url);
        if (!asset || asset.size !== file.size || !(file.size > 0)) throw new Error(`Missing or wrong-sized updater asset: ${file.url}`);
        if (typeof file.sha512 !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512)) throw new Error(`Invalid SHA-512: ${file.url}`);
        if (asset.sha512 && asset.sha512 !== file.sha512) throw new Error(`SHA-512 mismatch: ${file.url}`);
    }
    for (const name of installers) {
        if (!seen.has(name)) throw new Error(`Updater manifest omits installer: ${name}`);
    }
}

async function sha512(filePath) {
    const hash = crypto.createHash('sha512');
    for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
    return hash.digest('base64');
}

async function validateLocal(platform, version, directory) {
    const assets = [];
    for (const name of expectedFiles(platform, version)) {
        const filePath = path.join(directory, name);
        const stat = fs.statSync(filePath);
        if (!stat.isFile() || stat.size === 0) throw new Error(`Empty or invalid release asset: ${name}`);
        assets.push({ name, size: stat.size });
    }
    for (const name of platformFiles(platform, version).installers) {
        assets.find(asset => asset.name === name).sha512 = await sha512(path.join(directory, name));
    }
    const manifest = yaml.load(fs.readFileSync(path.join(directory, platformFiles(platform, version).manifest), 'utf8'));
    validateManifest(platform, version, manifest, assets);
    return assets;
}

async function main() {
    const version = require('../package.json').version;
    const tag = process.env.RELEASE_TAG;
    if (tag !== `v${version}`) throw new Error(`Tag ${tag} does not match package version ${version}`);
    if (process.argv[2] === 'local') {
        const assets = await validateLocal(process.platform, version, 'dist');
        console.log(`Validated ${assets.length} ${process.platform} assets, including installer SHA-512 checksums.`);
        return;
    }
    if (process.argv[2] !== 'remote') throw new Error('Use local or remote');
    const gh = args => execFileSync('gh', args, { encoding: 'utf8' });
    const release = JSON.parse(gh(['release', 'view', tag, '--json', 'assets,isDraft']));
    for (const platform of ['darwin', 'win32', 'linux']) {
        for (const name of expectedFiles(platform, version)) {
            if (!release.assets.some(asset => asset.name === name && asset.size > 0)) throw new Error(`Release is incomplete: ${name}`);
        }
    }
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube2txt-release-verify-'));
    try {
        for (const platform of ['darwin', 'win32', 'linux']) {
            const name = platformFiles(platform, version).manifest;
            gh(['release', 'download', tag, '--pattern', name, '--dir', directory]);
            validateManifest(platform, version, yaml.load(fs.readFileSync(path.join(directory, name), 'utf8')), release.assets);
        }
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
    console.log(`Verified all 14 release assets and all three updater manifests for ${tag}. Draft: ${release.isDraft}.`);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        `## ${tag} release assets verified\n\nBoth Mac DMGs and ZIPs, Windows EXE, Linux AppImage, blockmaps, and all updater manifests are present and valid.\n\nThe workflow does not publish releases. The draft is ready for maintainer review and publishing.\n`);
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { platformFiles, expectedFiles, validateManifest, validateLocal };
