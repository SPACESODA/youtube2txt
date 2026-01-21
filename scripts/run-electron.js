#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const electronPath = require('electron');

const args = process.argv.slice(2);
if (args.length === 0) {
    args.push('electron/main.js');
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, args, { stdio: 'inherit', env });
child.on('close', (code, signal) => {
    if (code === null) {
        console.error(electronPath, 'exited with signal', signal);
        process.exit(1);
    }
    process.exit(code);
});
