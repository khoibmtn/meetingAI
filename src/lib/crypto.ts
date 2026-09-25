import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

/**
 * Mã hoá đối xứng AES-256-GCM cho bí mật lưu trong CSDL (API key, refresh token).
 * Định dạng: v1.<iv b64url>.<tag b64url>.<ciphertext b64url>
 */

function key(): Buffer {
  const raw = serverEnv.encryptionKey();
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY phải là 32 byte mã hoá base64 (openssl rand -base64 32)");
  }
  return buf;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(payload: string): string {
  const [ver, ivB64, tagB64, ctB64] = payload.split(".");
  if (ver !== "v1" || !ivB64 || !tagB64 || !ctB64) throw new Error("Dữ liệu mã hoá không hợp lệ");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Gợi ý hiển thị khoá: "…a1B2" */
export function keyHint(secret: string): string {
  return `…${secret.slice(-4)}`;
}

/** Ký/kiểm tra token ngắn hạn (vd. state OAuth). */
export function signToken(data: string): string {
  const mac = createHmac("sha256", key()).update(data).digest("base64url");
  return `${Buffer.from(data).toString("base64url")}.${mac}`;
}

export function verifyToken(token: string): string | null {
  const [dataB64, mac] = token.split(".");
  if (!dataB64 || !mac) return null;
  const data = Buffer.from(dataB64, "base64url").toString("utf8");
  const expected = createHmac("sha256", key()).update(data).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return data;
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
