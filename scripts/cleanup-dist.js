'use strict';

const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
const targets = [
    path.join(distDir, 'mac-universal'),
    path.join(distDir, 'mac-universal-x64-temp'),
    path.join(distDir, 'mac-universal-arm64-temp')
];

for (const target of targets) {
    try {
        if (fs.existsSync(target)) {
            fs.rmSync(target, { recursive: true, force: true });
        }
    } catch (error) {
        console.warn(`[cleanup-dist] Failed to remove ${target}:`, error.message);
    }
}
