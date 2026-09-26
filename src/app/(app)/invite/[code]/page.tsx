import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UsersIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePageUser } from "@/lib/auth";
import { JoinButton } from "./join-button";

export const metadata: Metadata = { title: "Lời mời tham gia nhóm" };

export default async function InvitePage({ params }: PageProps<"/invite/[code]">) {
  const { code } = await params;
  await requirePageUser();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_group_invite", { p_code: code });
  const invite = data?.[0];
  if (invite?.already_member) redirect(`/groups/${invite.id}`);
  return (
    <div className="flex min-h-[70dvh] items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <UsersIcon className="size-6" />
        </div>
        {invite ? (
          <>
            <h1 className="text-xl font-semibold">Tham gia “{invite.name}”</h1>
            {invite.description ? <p className="text-sm text-muted-foreground">{invite.description}</p> : null}
            <p className="text-sm text-muted-foreground">{invite.member_count} thành viên</p>
            <JoinButton code={code} />
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Lời mời không hợp lệ</h1>
            <p className="text-sm text-muted-foreground">Mã mời đã bị đổi hoặc tắt. Hãy xin quản trị nhóm gửi lại link.</p>
          </>
        )}
      </div>
    </div>
  );
}
