'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawnSync } = require('child_process');

const REQUIRED_NODE_MAJOR = 20;
const PORT = Number(process.env.PORT) || 3000;
const repoRoot = path.resolve(__dirname, '..');

let failures = 0;
let warnings = 0;

function log(status, message) {
    console.log(`[${status}] ${message}`);
}

function parseMajor(version) {
    const major = Number(String(version || '').split('.')[0]);
    return Number.isFinite(major) ? major : 0;
}

function runVersion(cmd, args) {
    const result = spawnSync(cmd, args, { encoding: 'utf8' });
    if (result.error) {
        return { ok: false, error: result.error };
    }
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    return { ok: result.status === 0, output };
}

function fail(message) {
    failures += 1;
    log('FAIL', message);
}

function warn(message) {
    warnings += 1;
    log('WARN', message);
}

function ok(message) {
    log('OK', message);
}

function checkNode() {
    const version = process.versions.node;
    const major = parseMajor(version);
    if (major < REQUIRED_NODE_MAJOR) {
        fail(`Node.js ${REQUIRED_NODE_MAJOR}+ required. Found v${version}. Install from https://nodejs.org/`);
    } else {
        ok(`Node.js v${version}`);
    }
}

function checkNpm() {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const result = runVersion(npmCmd, ['--version']);
    if (!result.ok) {
        fail('npm not found. Reinstall Node.js (npm is bundled).');
        return;
    }
    ok(`npm v${result.output}`);
}

function checkPython() {
    if (process.platform === 'win32') {
        ok('Python not required on Windows.');
        return;
    }

    const candidates = ['python3', 'python'];
    for (const cmd of candidates) {
        const result = runVersion(cmd, ['--version']);
        if (!result.ok) continue;
        const match = result.output.match(/Python\s+(\d+)\./i);
        if (!match) continue;
        const major = Number(match[1]);
        if (major >= 3) {
            ok(`${cmd} ${result.output}`);
            return;
        }
        fail(`Python 3 required. Found ${result.output}`);
        return;
    }

    fail('Python 3 not found (required on macOS/Linux). Install from https://www.python.org/downloads/');
}

function checkWritePermissions() {
    const testPath = path.join(repoRoot, `.doctor_write_${process.pid}`);
    try {
        fs.writeFileSync(testPath, 'ok');
        fs.unlinkSync(testPath);
        ok('Write access to project folder.');
    } catch (error) {
        fail('No write access to project folder. Move the repo to a writable location.');
    }
}

function checkPortAvailability() {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.unref();
        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                warn(`Port ${PORT} is in use. Set PORT=3001 (or another port) when starting.`);
            } else {
                warn(`Could not check port ${PORT}: ${error.message}`);
            }
            resolve();
        });
        server.listen(PORT, '127.0.0.1', () => {
            server.close(() => {
                ok(`Port ${PORT} is available.`);
                resolve();
            });
        });
    });
}

async function main() {
    console.log('youtube2txt doctor');
    checkNode();
    checkNpm();
    checkPython();
    checkWritePermissions();
    await checkPortAvailability();

    if (failures > 0) {
        console.log(`\nDoctor found ${failures} issue(s). Fix them and re-run.`);
        process.exit(1);
    }
    if (warnings > 0) {
        console.log(`\nDoctor finished with ${warnings} warning(s).`);
        process.exit(0);
    }
    console.log('\nDoctor finished with no issues.');
}

main().catch((error) => {
    fail(`Unexpected error: ${error.message}`);
    process.exit(1);
});
