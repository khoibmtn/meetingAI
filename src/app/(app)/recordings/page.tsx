import type { Metadata } from "next";
import Link from "next/link";
import { MicIcon, UploadIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePageUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/app-shell/page-header";
import { RecordingsBrowser, type RecordingListItem } from "./recordings-browser";

export const metadata: Metadata = { title: "Bản ghi" };

export default async function RecordingsPage() {
  const { user } = await requirePageUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("recordings")
    .select(
      "id, title, category, meeting_date, duration_sec, status, upload_status, owner_id, created_at, tags, location, profiles:owner_id(full_name), recording_shares(group_id, groups(name))",
    )
    .order("created_at", { ascending: false })
    .limit(300);

  const items: RecordingListItem[] = (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    meetingDate: r.meeting_date,
    durationSec: r.duration_sec ? Number(r.duration_sec) : null,
    status: r.status,
    uploadStatus: r.upload_status,
    mine: r.owner_id === user.id,
    ownerName: (r.profiles as { full_name: string | null } | null)?.full_name ?? null,
    createdAt: r.created_at,
    tags: r.tags ?? [],
    location: r.location,
    groups: ((r.recording_shares ?? []) as { groups: { name: string } | null }[])
      .map((s) => s.groups?.name)
      .filter((g): g is string => Boolean(g)),
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Bản ghi"
        description="Giao ban, cuộc họp, hội nghị của bạn và được chia sẻ với bạn."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/recordings/new?mode=record">
                <MicIcon /> Ghi âm
              </Link>
            </Button>
            <Button asChild>
              <Link href="/recordings/new">
                <UploadIcon /> Tải tệp lên
              </Link>
            </Button>
          </>
        }
      />
      <RecordingsBrowser items={items} />
    </PageContainer>
  );
}
