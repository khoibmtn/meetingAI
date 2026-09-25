"use client";

import { useCallback, useEffect, useState } from "react";
import { apiJson } from "@/lib/client/api";
import { usageAccepts, type ConnectionSummary, type Usage } from "@/lib/ai/catalog";

export interface ConnectionsState {
  connections: ConnectionSummary[];
  assignments: { org: Partial<Record<Usage, string>>; mine: Partial<Record<Usage, string>> };
  isAdmin: boolean;
}

export function useConnections() {
  const [state, setState] = useState<ConnectionsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    apiJson<ConnectionsState>("/api/ai/connections")
      .then((d) => {
        if (!alive) return;
        setState(d);
        setError(null);
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { state, loading, error, reload };
}

/** Kết nối đang chọn: lựa chọn của người dùng, nếu chưa chọn thì dùng mặc định theo phân công. */
export function useConnectionChoice(state: ConnectionsState | null, usage: Usage) {
  const [choice, setChoice] = useState<string | undefined>();
  const valid = validConnectionsFor(state, usage);
  const value = choice && valid.some((c) => c.id === choice) ? choice : defaultConnectionFor(state, usage);
  return [value, setChoice] as const;
}

/** Kết nối hợp lệ (đã kiểm tra thành công) cho một vị trí sử dụng. */
export function validConnectionsFor(state: ConnectionsState | null, usage: Usage): ConnectionSummary[] {
  return (state?.connections ?? []).filter((c) => c.status === "ok" && usageAccepts(usage, c.provider));
}

/** Kết nối mặc định (theo phân công cá nhân → toàn hệ thống). */
export function defaultConnectionFor(state: ConnectionsState | null, usage: Usage): string | undefined {
  const valid = validConnectionsFor(state, usage);
  const ids = new Set(valid.map((c) => c.id));
  const mine = state?.assignments.mine[usage];
  if (mine && ids.has(mine)) return mine;
  const org = state?.assignments.org[usage];
  if (org && ids.has(org)) return org;
  return valid[0]?.id;
}
