import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret, keyHint } from "@/lib/crypto";
import { serverEnv } from "@/lib/env";
import type { Json, Tables, TablesUpdate } from "@/lib/database.types";
import {
  baseUrlError,
  PROVIDERS,
  USAGES,
  usageAccepts,
  type ConnectionSummary,
  type ModelParams,
  type ProviderKind,
  type Usage,
} from "./catalog";
import type { ConnectionConfig } from "./types";
import { AiError } from "./types";

type Row = Tables<"ai_connections">;

export type { ConnectionSummary };

export function toSummary(row: Row, userId?: string): ConnectionSummary {
  return {
    id: row.id,
    scope: row.scope as "org" | "user",
    name: row.name,
    provider: row.provider as ProviderKind,
    baseUrl: row.base_url,
    keyHint: row.key_hint,
    model: row.model,
    params: (row.params as ModelParams) ?? {},
    status: row.status as ConnectionSummary["status"],
    lastTestedAt: row.last_tested_at,
    lastLatencyMs: row.last_latency_ms,
    lastError: row.last_error,
    mine: row.scope === "user" && row.user_id === userId,
  };
}

function rowToConfig(row: Row): ConnectionConfig {
  let apiKey: string;
  try {
    apiKey = decryptSecret(row.encrypted_key);
  } catch {
    throw new Error(
      `Không giải mã được khoá API của kết nối “${row.name}” (APP_ENCRYPTION_KEY có thể đã thay đổi). Hãy sửa kết nối và nhập lại khoá.`,
    );
  }
  return {
    id: row.id,
    name: row.name,
    provider: row.provider as ProviderKind,
    baseUrl: row.base_url,
    apiKey,
    model: row.model,
    params: (row.params as ModelParams) ?? {},
  };
}

/** Các kết nối người dùng được phép dùng: của tổ chức + của riêng họ. */
export async function listAccessibleConnections(userId: string): Promise<Row[]> {
  const { data, error } = await createAdminClient()
    .from("ai_connections")
    .select("*")
    .or(`scope.eq.org,and(scope.eq.user,user_id.eq.${userId})`)
    .order("scope")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getConnectionRow(id: string): Promise<Row | null> {
  const { data } = await createAdminClient().from("ai_connections").select("*").eq("id", id).maybeSingle();
  return data;
}

function canUse(row: Row, userId?: string | null) {
  return row.scope === "org" || (row.scope === "user" && !!userId && row.user_id === userId);
}

/** Lấy cấu hình đầy đủ (đã giải mã) của một kết nối nếu người dùng có quyền dùng. */
export async function getConnectionConfig(id: string, userId?: string | null): Promise<ConnectionConfig> {
  const row = await getConnectionRow(id);
  if (!row || !canUse(row, userId)) throw new AiError("Kết nối AI không tồn tại hoặc bạn không có quyền dùng", "auth");
  return rowToConfig(row);
}

/**
 * Chọn kết nối cho một vị trí sử dụng:
 *   1) kết nối được chỉ định trong yêu cầu (nếu hợp lệ)
 *   2) phân công cá nhân → 3) phân công toàn hệ thống
 *   4) kết nối hợp lệ đầu tiên phù hợp → 5) khoá trong biến môi trường (GEMINI_API_KEY / SONIOX_API_KEY)
 * Chỉ dùng kết nối trạng thái "ok" (đã kiểm tra thành công) hoặc "untested".
 */
export async function resolveConnection(
  usage: Usage,
  userId?: string | null,
  preferredId?: string | null,
): Promise<ConnectionConfig | null> {
  const admin = createAdminClient();
  const valid = (row: Row | null | undefined): row is Row =>
    !!row && row.status !== "error" && canUse(row, userId) && usageAccepts(usage, row.provider as ProviderKind);

  if (preferredId) {
    const row = await getConnectionRow(preferredId);
    if (valid(row)) return rowToConfig(row);
  }

  const { data: assignments } = await admin
    .from("ai_assignments")
    .select("scope, user_id, connection_id")
    .eq("usage", usage)
    .or(userId ? `scope.eq.org,and(scope.eq.user,user_id.eq.${userId})` : "scope.eq.org");
  const ordered = [...(assignments ?? [])].sort((a, b) => (a.scope === "user" ? -1 : 1) - (b.scope === "user" ? -1 : 1));
  for (const a of ordered) {
    const row = await getConnectionRow(a.connection_id);
    if (valid(row)) return rowToConfig(row);
  }

  const { data: rows } = await admin
    .from("ai_connections")
    .select("*")
    .or(userId ? `scope.eq.org,and(scope.eq.user,user_id.eq.${userId})` : "scope.eq.org")
    .eq("status", "ok");
  const preferOrder: ProviderKind[] = usage === "transcription" ? ["gemini", "soniox"] : ["gemini", "anthropic", "openai", "deepseek", "openai_compatible"];
  const candidates = (rows ?? []).filter(valid).sort(
    (a, b) => preferOrder.indexOf(a.provider as ProviderKind) - preferOrder.indexOf(b.provider as ProviderKind),
  );
  if (candidates[0]) return rowToConfig(candidates[0]);

  const envGemini = serverEnv.envApiKey("gemini");
  if (envGemini) {
    return {
      id: undefined,
      name: "Gemini (biến môi trường)",
      provider: "gemini",
      apiKey: envGemini,
      model: process.env.GEMINI_MODEL || PROVIDERS.gemini.suggestedModels[0],
      params: {},
    };
  }
  const envSoniox = serverEnv.envApiKey("soniox");
  if (usage === "transcription" && envSoniox) {
    return { name: "Soniox (biến môi trường)", provider: "soniox", apiKey: envSoniox, model: "stt-async-v5", params: {} };
  }
  return null;
}

export async function requireConnection(usage: Usage, userId?: string | null, preferredId?: string | null) {
  const conn = await resolveConnection(usage, userId, preferredId);
  if (!conn) {
    const label = USAGES.find((u) => u.id === usage)?.label ?? usage;
    throw new AiError(
      `Chưa có kết nối AI hợp lệ cho "${label}". Vào Cài đặt → Kết nối AI để thêm và kiểm tra kết nối, rồi phân công cho vị trí này.`,
      "auth",
    );
  }
  return conn;
}

/**
 * Cập nhật trạng thái sau khi kiểm tra hoặc khi gặp lỗi xác thực lúc chạy thật.
 * Lỗi tạm thời (quá tải, giới hạn tần suất, mạng) chỉ ghi lại thông báo, KHÔNG đánh dấu kết nối
 * hỏng — nếu không, một đợt Gemini quá tải sẽ làm mọi tác vụ sau đó không còn kết nối để dùng.
 */
export async function recordConnectionStatus(
  id: string | undefined,
  result: { ok: boolean; latencyMs?: number; error?: string; transient?: boolean },
) {
  if (!id) return;
  await createAdminClient()
    .from("ai_connections")
    .update({
      ...(result.ok || !result.transient ? { status: result.ok ? "ok" : "error" } : {}),
      last_tested_at: new Date().toISOString(),
      last_latency_ms: result.latencyMs ?? null,
      last_error: result.ok ? null : (result.error ?? "Lỗi không rõ").slice(0, 500),
    })
    .eq("id", id);
}

/** Đánh dấu kết nối lỗi nếu lỗi là do khoá (401/403) — để không còn xuất hiện trong danh sách hợp lệ. */
export async function markAuthFailure(conn: ConnectionConfig, err: unknown) {
  if (err instanceof AiError && err.kind === "auth" && conn.id) {
    await recordConnectionStatus(conn.id, { ok: false, error: err.message });
  }
}

export interface ConnectionInput {
  id?: string;
  scope: "org" | "user";
  name: string;
  provider: ProviderKind;
  baseUrl?: string | null;
  apiKey?: string | null; // bỏ trống khi sửa = giữ khoá cũ
  model: string;
  params: ModelParams;
}

/** Chuẩn hoá tham số; bỏ mô hình dự phòng nếu trùng mô hình chính (không có tác dụng). */
export function sanitizeParams(p: ModelParams | undefined, model?: string): ModelParams {
  const out: ModelParams = {};
  if (!p) return out;
  const num = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null;
  if (p.temperature != null) out.temperature = num(p.temperature, 0, 2);
  if (p.topP != null) out.topP = num(p.topP, 0, 1);
  if (p.maxOutputTokens != null) out.maxOutputTokens = num(Math.round(p.maxOutputTokens), 256, 300_000);
  if (p.effort) out.effort = ["minimal", "low", "medium", "high", "xhigh", "max"].includes(p.effort) ? p.effort : null;
  if (p.verbosity) out.verbosity = ["low", "medium", "high"].includes(p.verbosity) ? p.verbosity : null;
  if (p.extra && typeof p.extra === "object" && !Array.isArray(p.extra)) out.extra = p.extra;
  const fallback = typeof p.fallbackModel === "string" ? p.fallbackModel.trim() : "";
  if (/^[\w.:/-]{1,100}$/.test(fallback) && fallback !== model?.trim()) out.fallbackModel = fallback;
  return out;
}

export async function saveConnection(input: ConnectionInput, actorId: string): Promise<Row> {
  const admin = createAdminClient();
  if (!PROVIDERS[input.provider]) throw new Error("Nhà cung cấp không hợp lệ");
  const urlError = baseUrlError(input.baseUrl);
  if (urlError) throw new Error(urlError);
  const base = {
    name: input.name.trim().slice(0, 120),
    provider: input.provider,
    base_url: input.baseUrl?.trim() || null,
    model: input.model.trim(),
    params: sanitizeParams(input.params, input.model) as unknown as Json,
    status: "untested",
    last_error: null,
  };
  if (!base.name || !base.model) throw new Error("Cần nhập tên kết nối và mô hình");
  if (input.id) {
    const existing = await getConnectionRow(input.id);
    if (!existing) throw new Error("Không tìm thấy kết nối");
    const patch: TablesUpdate<"ai_connections"> = { ...base };
    if (input.apiKey?.trim()) {
      patch.encrypted_key = encryptSecret(input.apiKey.trim());
      patch.key_hint = keyHint(input.apiKey.trim());
    }
    const { data, error } = await admin.from("ai_connections").update(patch).eq("id", input.id).select("*").single();
    if (error || !data) throw new Error(error?.message ?? "Không lưu được kết nối");
    return data;
  }
  if (!input.apiKey?.trim()) throw new Error("Cần nhập API key");
  const { data, error } = await admin
    .from("ai_connections")
    .insert({
      ...base,
      scope: input.scope,
      user_id: input.scope === "user" ? actorId : null,
      encrypted_key: encryptSecret(input.apiKey.trim()),
      key_hint: keyHint(input.apiKey.trim()),
      created_by: actorId,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Không lưu được kết nối");
  return data;
}

export async function getAssignments(userId: string) {
  const { data } = await createAdminClient()
    .from("ai_assignments")
    .select("scope, user_id, usage, connection_id")
    .or(`scope.eq.org,and(scope.eq.user,user_id.eq.${userId})`);
  const org: Partial<Record<Usage, string>> = {};
  const mine: Partial<Record<Usage, string>> = {};
  for (const a of data ?? []) {
    if (a.scope === "org") org[a.usage as Usage] = a.connection_id;
    else mine[a.usage as Usage] = a.connection_id;
  }
  return { org, mine };
}

export async function setAssignment(scope: "org" | "user", userId: string | null, usage: Usage, connectionId: string | null) {
  const admin = createAdminClient();
  let del = admin.from("ai_assignments").delete().eq("scope", scope).eq("usage", usage);
  del = scope === "user" ? del.eq("user_id", userId!) : del.is("user_id", null);
  await del;
  if (!connectionId) return;
  const row = await getConnectionRow(connectionId);
  if (!row) throw new Error("Không tìm thấy kết nối");
  if (scope === "org" && row.scope !== "org") throw new Error("Phân công toàn hệ thống chỉ dùng kết nối của tổ chức");
  if (scope === "user" && !canUse(row, userId)) throw new Error("Không có quyền dùng kết nối này");
  if (!usageAccepts(usage, row.provider as ProviderKind)) throw new Error("Kết nối không phù hợp với vị trí sử dụng này");
  if (row.status !== "ok") throw new Error("Chỉ phân công kết nối đã kiểm tra thành công");
  const { error } = await admin
    .from("ai_assignments")
    .insert({ scope, user_id: scope === "user" ? userId : null, usage, connection_id: connectionId });
  if (error) throw new Error(error.message);
}
