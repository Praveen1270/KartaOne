/**
 * AES-256-GCM encryption/decryption for storing sensitive data (cookies, tokens).
 * Key is loaded from ENCRYPTION_KEY env var — auto-generated on first run.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // bytes

function getKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    return Buffer.from(envKey, "hex");
  }
  // Auto-generate and persist to .env
  const newKey = crypto.randomBytes(KEY_LENGTH);
  const keyHex = newKey.toString("hex");
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const current = fs.readFileSync(envPath, "utf-8");
    if (!current.includes("ENCRYPTION_KEY=")) {
      fs.appendFileSync(envPath, `\nENCRYPTION_KEY=${keyHex}\n`);
    }
  }
  process.env.ENCRYPTION_KEY = keyHex;
  return newKey;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const [ivHex, tagHex, dataHex] = ciphertext.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Invalid ciphertext format");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final("utf-8");
}
