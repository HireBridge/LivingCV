import winston from 'winston';
import type Database from 'better-sqlite3';

const consoleFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level}: ${message}`;
});

export const baseLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        consoleFormat
      )
    })
  ]
});

/**
 * Logs a message to the console and to the SQLite system_logs table.
 */
export const systemLog = (db: Database.Database | null | undefined, level: 'info' | 'warn' | 'error', message: string, meta?: unknown) => {
  baseLogger.log(level, message, meta);
  try {
    if (db) {
      db.prepare('INSERT INTO system_logs (level, message, meta) VALUES (?, ?, ?)')
        .run(level, message, meta ? JSON.stringify(meta) : null);
    }
  } catch (e) {
    console.error('Failed to write to system_logs', e);
  }
};
