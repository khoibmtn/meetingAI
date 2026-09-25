import { type NextRequest } from "next/server";
import { jsonError, requireApiAdmin } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";
import type { OrganizationInfo } from "@/lib/reports/generate";

interface SecuritySettings {
  require_approval?: boolean;
}

export async function GET() {
  try {
    await requireApiAdmin();
    return Response.json({
      organization: (await getSetting<OrganizationInfo>("organization")) ?? {},
      security: (await getSetting<SecuritySettings>("security")) ?? {},
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireApiAdmin();
    const body = (await request.json()) as { organization?: OrganizationInfo; security?: SecuritySettings };
    if (body.organization) {
      const o = body.organization;
      await setSetting(
        "organization",
        {
          parentOrg: o.parentOrg?.trim().slice(0, 200) ?? "",
          orgName: o.orgName?.trim().slice(0, 200) ?? "",
          orgShort: o.orgShort?.trim().slice(0, 30) ?? "",
          place: o.place?.trim().slice(0, 100) ?? "",
        },
        user.id,
      );
    }
    if (body.security) {
      await setSetting("security", { require_approval: Boolean(body.security.require_approval) }, user.id);
    }
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
