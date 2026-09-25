"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Sao chép SQL khởi tạo CSDL để dán vào Supabase SQL Editor. */
export function CopyMigrationButton() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  async function copy() {
    setState("busy");
    try {
      const res = await fetch("/setup/migration", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      await navigator.clipboard.writeText(await res.text());
      setState("done");
    } catch {
      setState("error");
    }
  }
  return (
    <Button onClick={copy} disabled={state === "busy"}>
      {state === "done" ? <CheckIcon /> : <CopyIcon />}
      {state === "done" ? "Đã sao chép SQL" : state === "error" ? "Không sao chép được — bấm “Xem SQL”" : "Sao chép SQL khởi tạo"}
    </Button>
  );
}
