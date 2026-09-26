"use client";

/**
 * Lưu tạm các mảnh ghi âm vào IndexedDB trong lúc ghi — nếu trình duyệt bị đóng/treo,
 * có thể khôi phục lại bản ghi (không mất nội dung).
 */
const DB = "meetingai-recorder";
const STORE = "chunks";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { autoIncrement: true });
        s.createIndex("session", "session");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveChunk(session: string, blob: Blob, mimeType: string) {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ session, blob, mimeType, at: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

interface Row {
  session: string;
  blob: Blob;
  mimeType: string;
  at: number;
}

export async function listSessions(): Promise<{ session: string; size: number; mimeType: string; at: number }[]> {
  const db = await open();
  const rows = await new Promise<Row[]>((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as Row[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  const map = new Map<string, { session: string; size: number; mimeType: string; at: number }>();
  for (const r of rows) {
    const cur = map.get(r.session) ?? { session: r.session, size: 0, mimeType: r.mimeType, at: r.at };
    cur.size += r.blob.size;
    cur.at = Math.max(cur.at, r.at);
    map.set(r.session, cur);
  }
  return [...map.values()].sort((a, b) => b.at - a.at);
}

export async function loadSession(session: string): Promise<Blob | null> {
  const db = await open();
  const rows = await new Promise<Row[]>((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).index("session").getAll(session);
    req.onsuccess = () => resolve(req.result as Row[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  if (!rows.length) return null;
  return new Blob(
    rows.map((r) => r.blob),
    { type: rows[0].mimeType },
  );
}

export async function clearSession(session: string) {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const idx = tx.objectStore(STORE).index("session");
    const req = idx.openCursor(IDBKeyRange.only(session));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
