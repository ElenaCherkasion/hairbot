import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, '../../logs');

// Создаем директорию для логов
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const logLevels = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const currentLogLevel = process.env.LOG_LEVEL || 'INFO';

function shouldLog(level) {
  return logLevels[level] >= logLevels[currentLogLevel];
}

function formatMessage(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] ${message}\n`;
}

function writeToFile(filename, message) {
  const logFile = path.join(LOGS_DIR, filename);
  fs.appendFileSync(logFile, message);
}

export function debug(message) {
  if (shouldLog('DEBUG')) {
    const formatted = formatMessage('DEBUG', message);
    console.debug(formatted.trim());
    writeToFile('debug.log', formatted);
  }
}

export function info(message) {
  if (shouldLog('INFO')) {
    const formatted = formatMessage('INFO', message);
    console.log(formatted.trim());
    writeToFile('info.log', formatted);
    writeToFile('combined.log', formatted);
  }
}

export function warn(message) {
  if (shouldLog('WARN')) {
    const formatted = formatMessage('WARN', message);
    console.warn(formatted.trim());
    writeToFile('warn.log', formatted);
    writeToFile('combined.log', formatted);
  }
}

export function error(message, err = null) {
  const formatted = formatMessage('ERROR', message);
  console.error(formatted.trim());
  
  if (err) {
    const errorMsg = `Stack: ${err.stack || err.message}\n`;
    console.error(errorMsg.trim());
    writeToFile('error.log', formatted + errorMsg);
    writeToFile('combined.log', formatted + errorMsg);
  } else {
    writeToFile('error.log', formatted);
    writeToFile('combined.log', formatted);
  }
}

// Экспорт для быстрого доступа
export const logger = { debug, info, warn, error };
