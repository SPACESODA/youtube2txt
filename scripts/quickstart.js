'use strict';

const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runCommand(cmd, args, options = {}) {
    return new Promise((resolve) => {
        const child = spawn(cmd, args, {
            cwd: repoRoot,
            env: process.env,
            stdio: ['inherit', 'pipe', 'pipe'],
            ...options
        });

        let stdout = '';
        let stderr = '';

        if (child.stdout) {
            child.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
                process.stdout.write(chunk);
            });
        }
        if (child.stderr) {
            child.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
                process.stderr.write(chunk);
            });
        }

        child.on('error', (error) => resolve({ code: 1, stdout, stderr, error }));
        child.on('close', (code) => resolve({ code, stdout, stderr }));
    });
}

function printHints(output) {
    const text = output.toLowerCase();
    const hints = [];

    if (text.includes('unsupported engine') || text.includes('not compatible with your version of node')) {
        hints.push('Use Node.js 20+ for this project.');
    }
    if (text.includes('eacces') || text.includes('eperm')) {
        hints.push('Permissions error. Avoid sudo; try deleting node_modules and re-running.');
    }
    if (text.includes('node-gyp') || text.includes('python')) {
        hints.push('Python 3 may be missing (required on macOS/Linux).');
    }
    if (text.includes('enotfound') || text.includes('econnreset') || text.includes('etimedout')) {
        hints.push('Network issue. Check your connection or proxy/VPN settings.');
    }
    if (text.includes('eaddrinuse')) {
        hints.push('Port is in use. Try PORT=3001 npm start');
    }

    if (hints.length > 0) {
        console.log('\nHints:');
        for (const hint of hints) {
            console.log(`- ${hint}`);
        }
    }
}

async function main() {
    console.log('Quick start: running checks...');
    const doctorResult = await runCommand(process.execPath, [path.join(__dirname, 'doctor.js')]);
    if (doctorResult.code !== 0) {
        console.log('\nFix the issues above, then re-run: npm run quickstart');
        process.exit(1);
    }

    console.log('\nInstalling dependencies...');
    const installResult = await runCommand(npmCmd, ['install', '--no-fund', '--no-audit']);
    if (installResult.code !== 0) {
        console.log('\nInstall failed.');
        printHints(`${installResult.stdout}\n${installResult.stderr}`);
        process.exit(1);
    }

    console.log('\nStarting the server...');
    const serverProcess = spawn(npmCmd, ['start'], {
        cwd: repoRoot,
        env: process.env,
        stdio: 'inherit',
    });

    serverProcess.on('error', (error) => {
        console.error('\nFailed to start the server.', error);
        process.exit(1);
    });

    serverProcess.on('exit', (code) => {
        if (code !== 0) {
            console.log('\nServer exited with an error.');
        }
    });
}

main().catch((error) => {
    console.error(`Quick start failed: ${error.message}`);
    process.exit(1);
});
