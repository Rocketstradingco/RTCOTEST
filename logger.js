const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, 'debug.log');
const stream = fs.createWriteStream(logFile, { flags: 'a' });

function format(args) {
    return new Date().toISOString() + ' ' + args.map(a => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch { return String(a); }
    }).join(' ') + '\n';
}

function hookConsole() {
    ['log', 'info', 'warn', 'error'].forEach(level => {
        const orig = console[level];
        console[level] = (...args) => {
            try { stream.write(format(args)); } catch { /* ignore */ }
            orig.apply(console, args);
        };
    });
}

function installGlobalHandlers() {
    process.on('uncaughtException', err => {
        console.error('Uncaught Exception:', err);
    });
    process.on('unhandledRejection', err => {
        console.error('Unhandled Rejection:', err);
    });
}

module.exports = {
    init: () => {
        hookConsole();
        installGlobalHandlers();
        console.log(`Debug logging to ${logFile}`);
    }
};
