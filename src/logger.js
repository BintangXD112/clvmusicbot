const EventEmitter = require('events');

class LoggerEmitter extends EventEmitter {}
const loggerEmitter = new LoggerEmitter();

const logHistory = [];
const MAX_HISTORY = 150;

function addLog(level, tag, message, extra = '') {
  const timestamp = new Date().toISOString();
  const entry = {
    id: Date.now() + Math.random().toString(36).substr(2, 5),
    timestamp,
    level, // 'INFO', 'SUCCESS', 'WARN', 'ERROR'
    tag: tag || 'SYSTEM',
    message: String(message),
    extra: extra ? String(extra) : ''
  };

  logHistory.push(entry);
  if (logHistory.length > MAX_HISTORY) {
    logHistory.shift();
  }

  loggerEmitter.emit('log', entry);
}

// Hook original console functions to capture logs smoothly
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = function (...args) {
  originalLog.apply(console, args);
  const text = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  // Basic level detection if formatted
  let level = 'INFO';
  if (text.includes('[SUCCESS]') || text.includes('✅')) level = 'SUCCESS';
  if (text.includes('[WARN]') || text.includes('⚠️')) level = 'WARN';
  if (text.includes('[ERROR]') || text.includes('❌')) level = 'ERROR';
  addLog(level, 'CONSOLE', text);
};

console.warn = function (...args) {
  originalWarn.apply(console, args);
  const text = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  addLog('WARN', 'CONSOLE', text);
};

console.error = function (...args) {
  originalError.apply(console, args);
  const text = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  addLog('ERROR', 'CONSOLE', text);
};

module.exports = {
  loggerEmitter,
  getLogHistory: () => logHistory,
  addLog
};
