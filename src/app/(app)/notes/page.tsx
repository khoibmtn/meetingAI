import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requirePageUser } from "@/lib/auth";
import { PageContainer, PageHeader } from "@/components/app-shell/page-header";
import { NotesBoard } from "./notes-board";

export const metadata: Metadata = { title: "Ghi chú" };

export default async function NotesPage() {
  await requirePageUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notes")
    .select("id, title, content, anchor_sec, pinned, updated_at, recording_id, recordings(title)")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(500);
  return (
    <PageContainer>
      <PageHeader title="Ghi chú của tôi" description="Ghi chú cá nhân — chỉ bạn thấy. Ghi chú gắn mốc thời gian sẽ mở đúng đoạn âm thanh." />
      <NotesBoard
        initial={(data ?? []).map((n) => ({
          id: n.id,
          title: n.title,
          content: n.content,
          anchorSec: n.anchor_sec === null ? null : Number(n.anchor_sec),
          pinned: n.pinned,
          updatedAt: n.updated_at,
          recordingId: n.recording_id,
          recordingTitle: (n.recordings as { title: string } | null)?.title ?? null,
        }))}
      />
    </PageContainer>
  );
}
