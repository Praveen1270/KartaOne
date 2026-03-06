/**
 * Structured Winston logger.
 * Outputs colourised console logs in dev and JSON file logs in production.
 */

import winston from "winston";
import * as path from "path";
import * as fs from "fs";

const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const { combine, timestamp, colorize, printf, errors } = winston.format;

const devFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `${ts} [${level}]: ${stack || message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: combine(errors({ stack: true }), timestamp({ format: "HH:mm:ss" })),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: "HH:mm:ss" }), devFormat),
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      format: winston.format.json(),
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      format: winston.format.json(),
    }),
  ],
});
