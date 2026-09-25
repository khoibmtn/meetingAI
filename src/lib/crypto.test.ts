import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

vi.mock("server-only", () => ({}));

const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");

async function load() {
  vi.resetModules();
  return import("./crypto");
}

describe("crypto", () => {
  beforeEach(() => {
    process.env.APP_ENCRYPTION_KEY = KEY_A;
  });
  afterEach(() => {
    delete process.env.APP_ENCRYPTION_KEY;
  });

  it("mã hoá rồi giải mã được, mỗi lần một IV khác nhau", async () => {
    const { encryptSecret, decryptSecret } = await load();
    const a = encryptSecret("sk-bí-mật-123");
    const b = encryptSecret("sk-bí-mật-123");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(decryptSecret(a)).toBe("sk-bí-mật-123");
  });

  it("đổi APP_ENCRYPTION_KEY → báo lỗi dễ hiểu thay vì lỗi OpenSSL", async () => {
    const { encryptSecret } = await load();
    const payload = encryptSecret("sk-abc");
    process.env.APP_ENCRYPTION_KEY = KEY_B;
    const { decryptSecret } = await load();
    expect(() => decryptSecret(payload)).toThrow(/APP_ENCRYPTION_KEY/);
  });

  it("dữ liệu bị sửa → không giải mã được", async () => {
    const { encryptSecret, decryptSecret } = await load();
    const [v, iv, tag, ct] = encryptSecret("sk-abc").split(".");
    const flipped = ct.slice(0, -1) + (ct.endsWith("A") ? "B" : "A");
    expect(() => decryptSecret([v, iv, tag, flipped].join("."))).toThrow();
    expect(() => decryptSecret("rác")).toThrow(/không hợp lệ/);
  });

  it("ký và kiểm tra token; token bị sửa bị từ chối", async () => {
    const { signToken, verifyToken } = await load();
    const t = signToken("user-1|/admin");
    expect(verifyToken(t)).toBe("user-1|/admin");
    expect(verifyToken(t.slice(0, -2) + "xx")).toBeNull();
  });

  it("keyHint chỉ lộ 4 ký tự cuối", async () => {
    const { keyHint } = await load();
    expect(keyHint("sk-1234567890abcd")).toBe("…abcd");
  });
});
