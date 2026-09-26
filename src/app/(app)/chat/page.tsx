import type { Metadata } from "next";
import { MessagesSquareIcon } from "lucide-react";
import { ChannelList } from "@/components/chat/channel-list";

export const metadata: Metadata = { title: "Trò chuyện" };

export default function ChatPage() {
  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem-5rem)] max-w-6xl lg:h-dvh lg:p-6">
      <div className="flex min-h-0 flex-1 overflow-hidden border-y bg-card lg:rounded-xl lg:border">
        <ChannelList className="w-full lg:w-80 lg:border-r" />
        <div className="hidden flex-1 flex-col items-center justify-center gap-2 text-muted-foreground lg:flex">
          <MessagesSquareIcon className="size-10" />
          <p className="text-sm">Chọn một cuộc trò chuyện</p>
        </div>
      </div>
    </div>
  );
}
