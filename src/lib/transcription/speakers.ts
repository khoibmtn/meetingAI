import type { RawChunkSpeaker, Speaker } from "./types";
import { stripDiacritics } from "@/lib/utils";

/** "S1", "s01", "Speaker 1", "SPEAKER_01", "Người nói 1" -> "S1"; khác thì giữ nguyên (đã trim). */
export function normalizeSpeakerId(id: string | null | undefined): string {
  const raw = (id ?? "").trim();
  if (!raw) return "S?";
  const plain = stripDiacritics(raw).toLowerCase();
  const m = plain.match(/^(?:s|spk|speaker|nguoi noi|nguoi|ng)[\s_#-]*0*(\d{1,3})$/);
  if (m) return `S${parseInt(m[1], 10)}`;
  return raw;
}

const HONORIFICS = new Set([
  "bac", "si", "bs", "ths", "ts", "pgs", "gs", "thay", "co", "anh", "chi", "em", "ong", "ba", "dr",
  "cki", "ckii", "ck1", "ck2", "noi", "tru", "dieu", "duong", "dd", "ktv", "chu", "truong", "pho", "khoa",
]);

/** Chuẩn hoá tên để so khớp: "BS. Nguyễn Văn Hiển (Chủ tọa)" ~ "bác sĩ Hiển"? -> so khớp theo đuôi tên. */
export function normalizeName(name: string | null | undefined): string {
  const s = stripDiacritics((name ?? "").toLowerCase())
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = s.split(" ").filter(Boolean);
  while (parts.length > 1 && HONORIFICS.has(parts[0])) parts.shift();
  return parts.join(" ");
}

function isMeaningfulName(name?: string | null): boolean {
  const n = (name ?? "").trim();
  if (!n) return false;
  const plain = stripDiacritics(n.toLowerCase());
  return !/^(unknown|khong ro|chua ro|nguoi noi|speaker|s\d+|thanh vien|bac si \/ thanh vien|n\/a)/.test(plain);
}

export interface ChunkRoster {
  chunkIdx: number;
  speakers: RawChunkSpeaker[];
  /** Số giây nói của từng khoá trong đoạn (để bầu tên theo trọng số). */
  talkTime: Record<string, number>;
}

/**
 * Hợp nhất danh sách người nói giữa các đoạn.
 * Giả định: đoạn 1..n được yêu cầu dùng lại ID từ đoạn 0 (roster). Nếu một ID trong đoạn k
 * được gán TÊN khác với tên đã biết của ID đó, nhưng trùng tên với ID khác => ánh xạ sang ID kia.
 * Trả về: ánh xạ "chunkIdx:localId" -> globalKey và danh sách Speaker toàn cục.
 */
export function reconcileSpeakers(rosters: ChunkRoster[]): {
  mapping: Record<string, string>;
  speakers: Speaker[];
} {
  const mapping: Record<string, string> = {};
  const global = new Map<string, { names: Map<string, number>; roles: Map<string, number>; desc?: string }>();
  const nameIndex = new Map<string, string>(); // normalizedName -> globalKey

  const ensure = (key: string) => {
    if (!global.has(key)) global.set(key, { names: new Map(), roles: new Map() });
    return global.get(key)!;
  };
  const vote = (m: Map<string, number>, v: string, w: number) => m.set(v, (m.get(v) ?? 0) + w);
  const topName = (key: string) => {
    const g = global.get(key);
    if (!g || g.names.size === 0) return undefined;
    return [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  let nextNum = 1;
  const allocateKey = () => {
    while (global.has(`S${nextNum}`)) nextNum++;
    return `S${nextNum}`;
  };

  const sorted = [...rosters].sort((a, b) => a.chunkIdx - b.chunkIdx);
  for (const roster of sorted) {
    const localIds = new Set<string>([
      ...roster.speakers.map((s) => normalizeSpeakerId(s.id)),
      ...Object.keys(roster.talkTime).map((k) => normalizeSpeakerId(k)),
    ]);
    const used = new Set<string>();
    for (const localId of localIds) {
      const info = roster.speakers.find((s) => normalizeSpeakerId(s.id) === localId);
      const name = isMeaningfulName(info?.name) ? singleLabel(info!.name) || undefined : undefined;
      const norm = name ? normalizeName(name) : "";
      let target: string | undefined;

      if (norm && nameIndex.has(norm)) {
        target = nameIndex.get(norm);
      } else if (global.has(localId)) {
        const known = topName(localId);
        if (!name || !known || normalizeName(known) === norm) target = localId;
        else target = allocateKey(); // cùng ID nhưng tên khác hẳn => người khác
      } else {
        target = /^S\d+$/.test(localId) ? localId : allocateKey();
      }
      if (used.has(target!)) target = allocateKey();
      used.add(target!);

      const g = ensure(target!);
      const weight = Math.max(1, roster.talkTime[localId] ?? 1);
      if (name) {
        vote(g.names, name, weight);
        if (norm && !nameIndex.has(norm)) nameIndex.set(norm, target!);
      }
      if (singleLabel(info?.role)) vote(g.roles, singleLabel(info?.role), weight);
      if (info?.description && !g.desc) g.desc = info.description.trim();
      mapping[`${roster.chunkIdx}:${localId}`] = target!;
    }
  }

  const speakers: Speaker[] = [...global.entries()]
    .map(([key, g]) => {
      const name = [...g.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const role = [...g.roles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      return { key, name: name ?? defaultSpeakerName(key), role: role ?? null, description: g.desc ?? null };
    })
    .sort((a, b) => speakerOrder(a.key) - speakerOrder(b.key));
  return { mapping, speakers };
}

/**
 * Một khoá người nói chỉ mang MỘT tên / vai trò: "BS. Quang / BS. Dương" → "BS. Quang",
 * "Chủ tọa / Giáo sư" → "Chủ tọa". (Khoá lẫn hai người là lỗi phân vai, ghép tên chỉ che lỗi.)
 */
export function singleLabel(value: string | null | undefined): string {
  return (value ?? "").split(/\s*[/;|]\s*/)[0].trim();
}

/** Người nói đã được xác định tên (không phải nhãn phân vai tự động như "Người nói 3"). */
export function hasIdentifiedName(s: Pick<Speaker, "key" | "name">): boolean {
  return isMeaningfulName(s.name) && s.name.trim() !== defaultSpeakerName(s.key);
}

export function defaultSpeakerName(key: string): string {
  const m = key.match(/^S(\d+)$/);
  return m ? `Người nói ${m[1]}` : `Người nói ${key}`;
}

function speakerOrder(key: string): number {
  const m = key.match(/^S(\d+)$/);
  return m ? parseInt(m[1], 10) : 10_000;
}

/** Màu ổn định cho người nói (0..7) theo thứ tự xuất hiện. */
export function speakerColorIndex(key: string, speakers: Pick<Speaker, "key">[]): number {
  const idx = speakers.findIndex((s) => s.key === key);
  return (idx >= 0 ? idx : speakerOrder(key)) % 8;
}
