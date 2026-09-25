import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/app-shell/page-header";
import { getSessionProfile } from "@/lib/auth";
import { isDriveConfigured } from "@/lib/drive/google";
import { NewRecordingForm } from "./new-recording-form";

export const metadata: Metadata = { title: "Bản ghi mới" };

export default async function NewRecordingPage({ searchParams }: PageProps<"/recordings/new">) {
  const [sp, driveReady, session] = await Promise.all([searchParams, isDriveConfigured(), getSessionProfile()]);
  const mode = sp.mode === "record" ? "record" : "upload";
  const isAdmin = session?.profile?.role === "admin";
  return (
    <PageContainer>
      <PageHeader title="Bản ghi mới" description="Tải lên tệp ghi âm hoặc ghi âm trực tiếp, sau đó AI sẽ phiên âm và phân vai người nói." />
      {!driveReady ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-warning/50 bg-warning/10 p-4 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="font-medium">Chưa kết nối Google Drive — tệp ghi âm sẽ không được lưu.</p>
            <p className="text-muted-foreground">
              Vẫn phiên âm được: tệp chỉ được giữ tạm để phiên âm rồi tự xoá, bản ghi giữ lại transcript. Sau khi kết nối Drive,
              có thể tải tệp lên lại để nghe theo từng câu.{" "}
              {isAdmin ? (
                <>
                  Kết nối tại{" "}
                  <Link href="/admin?tab=storage" className="font-medium text-primary underline-offset-4 hover:underline">
                    Quản trị → Lưu trữ
                  </Link>
                  .
                </>
              ) : (
                "Quản trị viên kết nối Drive tại Quản trị → Lưu trữ."
              )}
            </p>
          </div>
        </div>
      ) : null}
      <NewRecordingForm initialMode={mode} storageReady={driveReady} />
    </PageContainer>
  );
}
