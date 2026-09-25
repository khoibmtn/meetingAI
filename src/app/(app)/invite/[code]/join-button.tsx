"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function JoinButton({ code }: { code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      className="w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const { data, error } = await createClient().rpc("join_group_by_code", { p_code: code });
        setBusy(false);
        if (error || !data) return toast.error(error?.message ?? "Không tham gia được");
        router.push(`/groups/${data}`);
      }}
    >
      Tham gia nhóm
    </Button>
  );
}
