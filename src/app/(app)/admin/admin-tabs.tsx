"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { CheckCircle2Icon, HardDriveIcon, Loader2Icon, XCircleIcon } from "lucide-react";
import type { Tables } from "@/lib/database.types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConnectionsManager } from "@/components/ai/connections-manager";
import { UsageCard } from "@/components/ai/usage-card";
import { useProfile } from "@/components/profile-context";
import { apiJson } from "@/lib/client/api";
import { formatBytes } from "@/lib/utils";
import { SystemCheck } from "./system-check";

type UserRow = Pick<Tables<"profiles">, "id" | "email" | "full_name" | "title" | "department" | "role" | "status" | "created_at" | "avatar_url">;

export function AdminTabs({ initialTab, users, driveNotice }: { initialTab: string; users: UserRow[]; driveNotice: string | null }) {
  const [tab, setTab] = useState(initialTab);
  useEffect(() => {
    if (driveNotice === "connected") toast.success("Đã kết nối Google Drive");
    else if (driveNotice) toast.error(`Kết nối Google Drive thất bại: ${driveNotice}`);
  }, [driveNotice]);
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="w-full overflow-x-auto sm:w-fit">
        <TabsTrigger value="ai">Kết nối AI</TabsTrigger>
        <TabsTrigger value="storage">Lưu trữ</TabsTrigger>
        <TabsTrigger value="org">Đơn vị</TabsTrigger>
        <TabsTrigger value="users">Người dùng</TabsTrigger>
        <TabsTrigger value="check">Kiểm tra</TabsTrigger>
      </TabsList>
      <TabsContent value="ai" className="space-y-4 pt-4">
        <ConnectionsManager scope="org" />
        <UsageCard />
      </TabsContent>
      <TabsContent value="storage" className="pt-4">
        <StorageCard />
      </TabsContent>
      <TabsContent value="org" className="pt-4">
        <OrgCard />
      </TabsContent>
      <TabsContent value="users" className="pt-4">
        <UsersCard users={users} />
      </TabsContent>
      <TabsContent value="check" className="pt-4">
        <SystemCheck />
      </TabsContent>
    </Tabs>
  );
}

interface DriveStatus {
  configured: boolean;
  oauthReady: boolean;
  ok?: boolean;
  email?: string;
  folderId?: string | null;
  quota?: { limit?: string; usage?: string };
  connectedAt?: string | null;
  error?: string;
}

function StorageCard() {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const load = useCallback(() => {
    apiJson<DriveStatus>("/api/admin/drive/status")
      .then(setStatus)
      .catch((e: Error) => toast.error(e.message));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDriveIcon className="size-5" /> Google Drive
        </CardTitle>
        <CardDescription>
          Tệp ghi âm gốc lưu nguyên vẹn trong thư mục “MeetingAI - Ghi âm” của tài khoản Google được kết nối. Ứng dụng tự kiểm soát quyền
          nghe theo nhóm, không cần chia sẻ tệp Drive cho từng người. Quyền truy cập chỉ giới hạn trong các tệp do ứng dụng tạo (scope
          drive.file).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!status ? (
          <Loader2Icon className="size-5 animate-spin" />
        ) : !status.oauthReady ? (
          <p className="text-sm text-destructive">Thiếu GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET trong biến môi trường.</p>
        ) : status.configured && status.ok ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 font-medium text-success">
              <CheckCircle2Icon className="size-4" /> Đã kết nối: {status.email}
            </div>
            {status.quota?.limit ? (
              <div className="text-muted-foreground">
                Dung lượng: {formatBytes(Number(status.quota.usage))} / {formatBytes(Number(status.quota.limit))}
              </div>
            ) : null}
            {status.folderId ? (
              <a className="text-primary hover:underline" href={`https://drive.google.com/drive/folders/${status.folderId}`} target="_blank" rel="noreferrer">
                Mở thư mục lưu trữ trên Google Drive →
              </a>
            ) : null}
          </div>
        ) : status.configured ? (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <XCircleIcon className="mt-0.5 size-4" /> {status.error}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Chưa kết nối.</p>
        )}
        <Button asChild>
          <a href="/api/admin/drive/connect">{status?.configured ? "Kết nối lại tài khoản Google" : "Kết nối Google Drive"}</a>
        </Button>
        <p className="text-xs text-muted-foreground">
          Lưu ý: ứng dụng OAuth trong Google Cloud cần ở trạng thái “In production”; nếu để “Testing”, refresh token hết hạn sau 7 ngày.
        </p>
      </CardContent>
    </Card>
  );
}

interface OrgInfo {
  parentOrg?: string;
  orgName?: string;
  orgShort?: string;
  place?: string;
  contactEmail?: string;
}

function OrgCard() {
  const [org, setOrg] = useState<OrgInfo>({});
  const [requireApproval, setRequireApproval] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    apiJson<{ organization: OrgInfo; security: { require_approval?: boolean } }>("/api/admin/settings")
      .then((d) => {
        setOrg(d.organization);
        setRequireApproval(Boolean(d.security.require_approval));
        setLoaded(true);
      })
      .catch((e: Error) => toast.error(e.message));
  }, []);
  async function save() {
    try {
      await apiJson("/api/admin/settings", { method: "POST", json: { organization: org, security: { require_approval: requireApproval } } });
      toast.success("Đã lưu");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  if (!loaded) return <Loader2Icon className="size-5 animate-spin" />;
  const set = (k: keyof OrgInfo) => (e: React.ChangeEvent<HTMLInputElement>) => setOrg((o) => ({ ...o, [k]: e.target.value }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Thông tin đơn vị & bảo mật</CardTitle>
        <CardDescription>
          Dùng cho phần đầu văn bản hành chính (biên bản theo NĐ 30/2020/NĐ-CP) và trang Chính sách quyền riêng tư, Điều khoản sử dụng.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Cơ quan chủ quản</Label>
          <Input value={org.parentOrg ?? ""} onChange={set("parentOrg")} placeholder="VD: SỞ Y TẾ HẢI PHÒNG" />
        </div>
        <div className="space-y-1.5">
          <Label>Tên đơn vị</Label>
          <Input value={org.orgName ?? ""} onChange={set("orgName")} placeholder="VD: TRUNG TÂM Y TẾ …" />
        </div>
        <div className="space-y-1.5">
          <Label>Chữ viết tắt (số, ký hiệu)</Label>
          <Input value={org.orgShort ?? ""} onChange={set("orgShort")} placeholder="VD: TTYT" />
        </div>
        <div className="space-y-1.5">
          <Label>Địa danh</Label>
          <Input value={org.place ?? ""} onChange={set("place")} placeholder="VD: Hải Phòng" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Email liên hệ</Label>
          <Input type="email" value={org.contactEmail ?? ""} onChange={set("contactEmail")} placeholder="VD: khth@benhvien.vn" />
          <p className="text-xs text-muted-foreground">
            Hiển thị công khai ở trang{" "}
            <a href="/privacy" target="_blank" className="underline underline-offset-2">
              Chính sách quyền riêng tư
            </a>{" "}
            và{" "}
            <a href="/terms" target="_blank" className="underline underline-offset-2">
              Điều khoản sử dụng
            </a>
            .
          </p>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
          <div>
            <div className="text-sm font-medium">Tài khoản mới phải được quản trị viên duyệt</div>
            <div className="text-xs text-muted-foreground">Khuyến nghị bật khi đăng nhập Google mở cho mọi tài khoản.</div>
          </div>
          <Switch checked={requireApproval} onCheckedChange={setRequireApproval} />
        </label>
        <div className="sm:col-span-2">
          <Button onClick={save}>Lưu</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function UsersCard({ users }: { users: UserRow[] }) {
  const me = useProfile();
  const router = useRouter();
  async function patch(id: string, body: { role?: string; status?: string }) {
    try {
      await apiJson(`/api/admin/users/${id}`, { method: "PATCH", json: body });
      toast.success("Đã cập nhật");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const pending = users.filter((u) => u.status === "pending").length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Người dùng ({users.length})</CardTitle>
        <CardDescription>{pending ? `${pending} tài khoản đang chờ duyệt.` : "Quản lý vai trò và trạng thái tài khoản."}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-lg border">
          {users.map((u) => (
            <li key={u.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <UserAvatar name={u.full_name ?? u.email} src={u.avatar_url} />
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {u.full_name ?? "—"} {u.id === me.id ? <Badge variant="outline">Bạn</Badge> : null}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {u.email} • {[u.title, u.department].filter(Boolean).join(", ") || "—"} • tham gia {format(new Date(u.created_at), "dd/MM/yyyy")}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Select value={u.role} onValueChange={(v) => patch(u.id, { role: v })} disabled={u.id === me.id}>
                  <SelectTrigger size="sm" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Thành viên</SelectItem>
                    <SelectItem value="admin">Quản trị viên</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={u.status} onValueChange={(v) => patch(u.id, { status: v })} disabled={u.id === me.id}>
                  <SelectTrigger size="sm" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Hoạt động</SelectItem>
                    <SelectItem value="pending">Chờ duyệt</SelectItem>
                    <SelectItem value="disabled">Khoá</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
