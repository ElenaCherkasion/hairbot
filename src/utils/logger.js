// src/utils/logger.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Создаем директорию для логов
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

let logger;

try {
  const { default: winston } = await import('winston');

  logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json()
    ),
    defaultMeta: { service: 'hairbot' },
    transports: [
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error'
      }),
      new winston.transports.File({
        filename: path.join(logDir, 'combined.log')
      })
    ]
  });

  // В development добавляем консольный вывод
  if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }));
  }
} catch {
  const serializeMeta = (meta) => {
    if (!meta) return '';
    try {
      return JSON.stringify(meta);
    } catch {
      return String(meta);
    }
  };

  logger = {
    info: (message, meta) => console.log(message, serializeMeta(meta)),
    warn: (message, meta) => console.warn(message, serializeMeta(meta)),
    error: (message, meta) => console.error(message, serializeMeta(meta))
  };
}

export default logger;
