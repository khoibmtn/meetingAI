import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, UsersIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePageUser } from "@/lib/auth";
import { ChannelList } from "@/components/chat/channel-list";
import { ChatRoom } from "@/components/chat/chat-room";

export const metadata: Metadata = { title: "Trò chuyện" };

export default async function ChatRoomPage({ params }: PageProps<"/chat/[id]">) {
  const { id } = await params;
  const { user } = await requirePageUser();
  const supabase = await createClient();
  const { data: channel } = await supabase.from("channels").select("id,kind,group_id,groups(name)").eq("id", id).maybeSingle();
  if (!channel) notFound();
  let title = (channel.groups as { name: string } | null)?.name ?? "Trò chuyện";
  if (channel.kind === "direct") {
    const { data: members } = await supabase.from("channel_members").select("user_id, profiles(full_name,email)").eq("channel_id", id);
    const other = (members ?? []).find((m) => m.user_id !== user.id);
    const p = other?.profiles as { full_name: string | null; email: string | null } | null;
    title = p?.full_name ?? p?.email ?? "Trò chuyện";
  }
  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem-5rem)] max-w-6xl lg:h-dvh lg:p-6">
      <div className="flex min-h-0 flex-1 overflow-hidden border-y bg-card lg:rounded-xl lg:border">
        <ChannelList activeId={id} className="hidden w-80 border-r lg:flex" />
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-2.5">
            <Link href="/chat" className="rounded-md p-1 hover:bg-accent lg:hidden" aria-label="Quay lại">
              <ArrowLeftIcon className="size-5" />
            </Link>
            <div className="min-w-0 flex-1 truncate font-semibold">{title}</div>
            {channel.group_id ? (
              <Link href={`/groups/${channel.group_id}`} className="flex items-center gap-1 text-sm text-primary hover:underline">
                <UsersIcon className="size-4" /> Nhóm
              </Link>
            ) : null}
          </div>
          <ChatRoom channelId={id} className="flex-1" />
        </div>
      </div>
    </div>
  );
}
