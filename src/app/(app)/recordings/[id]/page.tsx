import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requirePageUser } from "@/lib/auth";
import { RecordingWorkspace } from "@/components/recordings/workspace";
import { isDriveConfigured } from "@/lib/drive/google";
import type { Segment, Speaker, TranscriptQuality } from "@/lib/transcription/types";

export async function generateMetadata({ params }: PageProps<"/recordings/[id]">): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("recordings").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ?? "Bản ghi" };
}

export default async function RecordingPage({ params }: PageProps<"/recordings/[id]">) {
  const { id } = await params;
  const { user } = await requirePageUser();
  const supabase = await createClient();
  const { data: recording } = await supabase.from("recordings").select("*").eq("id", id).maybeSingle();
  if (!recording) notFound();

  const [{ data: transcript }, { data: job }, { data: reports }, { data: canEdit }, { data: templates }, storageReady] = await Promise.all([
    supabase.from("transcripts").select("*").eq("recording_id", id).maybeSingle(),
    supabase.from("transcription_jobs").select("*").eq("recording_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("reports")
      .select("id,title,template_key,status,is_shared,created_by,created_at,updated_at,provider,model,profiles:created_by(full_name)")
      .eq("recording_id", id)
      .order("created_at", { ascending: false }),
    supabase.rpc("can_edit_recording", { rid: id }),
    supabase.from("templates").select("id,name,description,category").order("sort_order").order("name"),
    isDriveConfigured().catch(() => false),
  ]);

  return (
    <RecordingWorkspace
      recording={recording}
      transcript={
        transcript
          ? {
              segments: (transcript.segments as unknown as Segment[]) ?? [],
              originalSegments: (transcript.original_segments as unknown as Segment[]) ?? [],
              speakers: (transcript.speakers as unknown as Speaker[]) ?? [],
              version: transcript.version,
              quality: (transcript.quality as unknown as TranscriptQuality) ?? null,
              engine: transcript.engine,
              model: transcript.model,
            }
          : null
      }
      job={job}
      reports={(reports ?? []).map(({ profiles, ...r }) => ({
        ...r,
        author: (profiles as { full_name: string | null } | null)?.full_name ?? null,
      }))}
      customTemplates={templates ?? []}
      canEdit={Boolean(canEdit)}
      isOwner={recording.owner_id === user.id}
      storageReady={storageReady}
    />
  );
}
