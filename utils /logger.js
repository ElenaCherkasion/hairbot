import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Создаем папку для логов если её нет
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Уровни логирования
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const CURRENT_LEVEL = process.env.LOG_LEVEL || 'INFO';

function shouldLog(level) {
  return LOG_LEVELS[level] <= LOG_LEVELS[CURRENT_LEVEL];
}

function formatLog(level, message, data = null) {
  const timestamp = new Date().toISOString();
  let logEntry = `[${timestamp}] [${level}] ${message}`;
  
  if (data) {
    if (typeof data === 'object') {
      try {
        logEntry += ` | ${JSON.stringify(data)}`;
      } catch {
        logEntry += ` | ${String(data)}`;
      }
    } else {
      logEntry += ` | ${data}`;
    }
  }
  
  return logEntry + '\n';
}

function writeToFile(filename, content) {
  const logPath = path.join(logsDir, filename);
  fs.appendFileSync(logPath, content);
}

export function error(message, error = null) {
  if (!shouldLog('ERROR')) return;
  
  const logMessage = formatLog('ERROR', message, error?.message || error);
  console.error(logMessage.trim());
  writeToFile('error.log', logMessage);
  writeToFile('app.log', logMessage);
  
  if (error?.stack) {
    const stackTrace = formatLog('ERROR', 'Stack trace:', error.stack);
    writeToFile('error.log', stackTrace);
  }
}

export function warn(message, data = null) {
  if (!shouldLog('WARN')) return;
  
  const logMessage = formatLog('WARN', message, data);
  console.warn(logMessage.trim());
  writeToFile('warn.log', logMessage);
  writeToFile('app.log', logMessage);
}

export function info(message, data = null) {
  if (!shouldLog('INFO')) return;
  
  const logMessage = formatLog('INFO', message, data);
  console.log(logMessage.trim());
  writeToFile('info.log', logMessage);
  writeToFile('app.log', logMessage);
}

export function debug(message, data = null) {
  if (!shouldLog('DEBUG')) return;
  
  const logMessage = formatLog('DEBUG', message, data);
  console.debug(logMessage.trim());
  writeToFile('debug.log', logMessage);
  writeToFile('app.log', logMessage);
}

// Утилитарные функции
export function logCommand(userId, command, data = null) {
  info(`Команда от пользователя ${userId}: ${command}`, data);
}

export function logPhotoUpload(userId, photoId, size = null) {
  info(`Фото от пользователя ${userId}`, { photoId, size });
}

export function logAnalysis(userId, tariff, result = null) {
  info(`Анализ пользователя ${userId}`, { tariff, success: !!result });
}

export default {
  error,
  warn,
  info,
  debug,
  logCommand,
  logPhotoUpload,
  logAnalysis
};
