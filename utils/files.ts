/**
 * File helpers — download Telegram files locally, send documents,
 * and clean up temp files after they've been delivered to the user.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as https from "https";
import * as http from "http";
import { logger } from "./logger";

/** Download a file from a URL to a local path. */
export function downloadUrl(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const file = fs.createWriteStream(destPath);
    proto
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode ?? "?"} for ${url}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
      })
      .on("error", (err) => {
        fs.unlinkSync(destPath);
        reject(err);
      });
  });
}

/**
 * Download a Telegram file using its file_id.
 * Returns the local path where it was saved.
 */
export async function downloadTelegramFile(
  botToken: string,
  fileId: string,
  fileName: string
): Promise<string> {
  // Step 1: Get file path from Telegram
  const infoUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
  const fileInfo = await fetchJson<{ ok: boolean; result: { file_path: string } }>(infoUrl);

  if (!fileInfo.ok || !fileInfo.result?.file_path) {
    throw new Error(`Could not get file path for file_id: ${fileId}`);
  }

  // Step 2: Download the actual file
  const downloadUrl_ = `https://api.telegram.org/file/bot${botToken}/${fileInfo.result.file_path}`;
  const tmpDir = path.join(os.tmpdir(), "bharat-uploads");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const destPath = path.join(tmpDir, `${Date.now()}-${safeName}`);

  await downloadUrl(downloadUrl_, destPath);
  logger.info(`Downloaded Telegram file: ${fileName} → ${destPath}`);
  return destPath;
}

/** Fetch a URL and parse the response as JSON. */
function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data) as T);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

/** Create a fresh temp directory for a skill's output. */
export function createSkillTmpDir(skillName: string): string {
  const dir = path.join(os.tmpdir(), `bharat-${skillName}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Safely remove a directory and all its contents. */
export function cleanupDir(dirPath: string): void {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (e) {
    logger.warn(`Could not clean up ${dirPath}:`, e);
  }
}

/** Safely delete a single file. */
export function safeDeleteFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

/** Check if a file exists and is readable. */
export function fileExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/** Get the MIME type of a file by its extension. */
export function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".txt": "text/plain",
    ".json": "application/json",
    ".zip": "application/zip",
    ".csv": "text/csv",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return mimeMap[ext] ?? "application/octet-stream";
}
