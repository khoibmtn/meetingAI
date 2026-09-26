"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Tổng số tin nhắn chưa đọc (cập nhật theo realtime + khi quay lại tab). */
export function useUnreadCount(userId: string) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    const load = async () => {
      const { data } = await supabase.rpc("my_channels");
      if (alive && data) setCount(data.reduce((a, c) => a + Number(c.unread_count ?? 0), 0));
    };
    load();
    const channel = supabase
      .channel(`unread-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => load())
      .subscribe();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("meetingai:chat-read", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("meetingai:chat-read", onFocus);
      supabase.removeChannel(channel);
    };
  }, [userId]);
  return count;
}
