import "server-only";
import { cache } from "react";
import { getSetting } from "@/lib/settings";
import type { OrganizationInfo } from "@/lib/reports/generate";

export const LEGAL_UPDATED = "25/09/2026";

/** Tên đơn vị và email liên hệ cho trang chính sách — không lỗi khi CSDL chưa sẵn sàng (vd lúc build). */
export const getLegalOrg = cache(async (): Promise<{ name: string | null; email: string | null }> => {
  try {
    const o = (await getSetting<OrganizationInfo>("organization")) ?? {};
    return { name: o.orgName?.trim() || null, email: o.contactEmail?.trim() || null };
  } catch {
    return { name: null, email: null };
  }
});
