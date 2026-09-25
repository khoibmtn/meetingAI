import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/app-shell/page-header";
import { NewRecordingForm } from "./new-recording-form";

export const metadata: Metadata = { title: "Bản ghi mới" };

export default async function NewRecordingPage({ searchParams }: PageProps<"/recordings/new">) {
  const sp = await searchParams;
  const mode = sp.mode === "record" ? "record" : "upload";
  return (
    <PageContainer>
      <PageHeader title="Bản ghi mới" description="Tải lên tệp ghi âm hoặc ghi âm trực tiếp, sau đó AI sẽ phiên âm và phân vai người nói." />
      <NewRecordingForm initialMode={mode} />
    </PageContainer>
  );
}
