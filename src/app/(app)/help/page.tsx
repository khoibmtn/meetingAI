import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeftIcon,
  AudioLinesIcon,
  BookmarkPlusIcon,
  BookTextIcon,
  ClockIcon,
  CombineIcon,
  CompassIcon,
  CopyIcon,
  CrosshairIcon,
  DownloadIcon,
  FileDownIcon,
  FileTextIcon,
  HistoryIcon,
  InfoIcon,
  LifeBuoyIcon,
  LightbulbIcon,
  LockIcon,
  LogInIcon,
  LogOutIcon,
  MenuIcon,
  MessageSquareTextIcon,
  MessagesSquareIcon,
  MicIcon,
  MoreHorizontalIcon,
  NotebookPenIcon,
  PaperclipIcon,
  PencilIcon,
  PenSquareIcon,
  PinIcon,
  PlayIcon,
  PlugZapIcon,
  PlusIcon,
  RefreshCwIcon,
  RocketIcon,
  RotateCcwIcon,
  RotateCwIcon,
  ScrollTextIcon,
  SearchIcon,
  SettingsIcon,
  Share2Icon,
  ShieldCheckIcon,
  SparklesIcon,
  SquareIcon,
  Trash2Icon,
  UploadCloudIcon,
  UploadIcon,
  UserRoundIcon,
  UsersIcon,
  WandSparklesIcon,
} from "lucide-react";
import { PageContainer, PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { CATEGORIES } from "@/components/recordings/category";
import { SYSTEM_TEMPLATES } from "@/lib/reports/templates";
import { DEFAULT_GLOSSARY } from "@/lib/transcription/glossary-defaults";
import { USAGES } from "@/lib/ai/catalog";
import { TEMP_AUDIO_MAX_BYTES, TEMP_AUDIO_TTL_DAYS } from "@/lib/audio/limits";
import { formatBytes } from "@/lib/utils";
import { Bullets, Callout, Code, DefList, Faq, GuideSection, Kbd, MobileToc, Steps, Task, Toc, Topic, Ui, type TocItem } from "./guide";

export const metadata: Metadata = { title: "Hướng dẫn sử dụng" };

const TOC: TocItem[] = [
  { id: "bat-dau", label: "Bắt đầu nhanh" },
  { id: "dieu-huong", label: "Bố cục & điều hướng" },
  { id: "ban-ghi", label: "Bản ghi" },
  { id: "ban-ghi-moi", label: "Bản ghi mới" },
  {
    id: "chi-tiet",
    label: "Trang chi tiết bản ghi",
    children: [
      { id: "trinh-phat", label: "Trình phát" },
      { id: "transcript", label: "Đọc transcript" },
      { id: "hieu-dinh", label: "Hiệu đính & người nói" },
      { id: "van-ban", label: "Văn bản tổng hợp" },
      { id: "hoi-dap", label: "Hỏi đáp AI" },
      { id: "ghi-chu-ban-ghi", label: "Ghi chú" },
      { id: "thong-tin", label: "Thông tin" },
      { id: "chia-se", label: "Chia sẻ & quyền" },
    ],
  },
  { id: "nhom", label: "Nhóm" },
  { id: "tro-chuyen", label: "Trò chuyện" },
  { id: "ghi-chu", label: "Ghi chú" },
  { id: "template", label: "Template tổng hợp" },
  { id: "tu-dien", label: "Từ điển thuật ngữ" },
  { id: "cai-dat", label: "Cài đặt cá nhân" },
  { id: "meo", label: "Mẹo để transcript chính xác" },
  { id: "su-co", label: "Xử lý sự cố" },
  { id: "quyen", label: "Ai thấy được gì?" },
];

const QUICK_START: { title: string; body: React.ReactNode; href: string }[] = [
  {
    title: "Hoàn thiện hồ sơ",
    body: "Vào Cài đặt, điền họ tên, chức danh, khoa/phòng để đồng nghiệp tìm đúng bạn khi chia sẻ, nhắn tin.",
    href: "/settings",
  },
  {
    title: "Tạo bản ghi",
    body: "Bấm “Bản ghi mới”: tải tệp lên hoặc ghi âm ngay, điền “Thành phần tham dự” kèm vai trò rồi bấm “Lưu & phiên âm”.",
    href: "/recordings/new",
  },
  {
    title: "Chờ phiên âm",
    body: "Thanh tiến độ hiện trên trang bản ghi. Có thể rời trang — máy chủ vẫn xử lý, transcript tự hiện khi xong.",
    href: "#chi-tiet",
  },
  {
    title: "Rà soát transcript",
    body: "Đổi tên người nói chưa đúng, gộp người bị tách nhầm, sửa câu sai bằng nút “Hiệu đính”.",
    href: "#hieu-dinh",
  },
  {
    title: "Dùng kết quả",
    body: "Tạo văn bản tổng hợp rồi xuất Word, chia sẻ vào nhóm, hỏi AI về nội dung buổi họp.",
    href: "#van-ban",
  },
];

const tempLimit = formatBytes(TEMP_AUDIO_MAX_BYTES);

export default function HelpPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Hướng dẫn sử dụng"
        description="Mỗi trang trong MeetingAI có gì, dùng để làm gì và thao tác thế nào."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-8">
        <div className="min-w-0 space-y-6">
          <MobileToc items={TOC} />

          <GuideSection id="bat-dau" icon={RocketIcon} title="Bắt đầu nhanh">
            <p>
              MeetingAI nhận tệp ghi âm (hoặc ghi âm trực tiếp) giao ban, cuộc họp, hội nghị. AI chuyển lời nói thành văn bản có tách
              và gắn tên người nói (<b>transcript</b>), soạn văn bản tổng hợp theo mẫu (biên bản giao ban, biên bản NĐ 30/2020, tóm tắt
              hội nghị…) và trả lời câu hỏi về nội dung — câu trả lời kèm mốc thời gian để nghe lại đúng đoạn.
            </p>
            <ol className="grid gap-3 sm:grid-cols-2">
              {QUICK_START.map((s, i) => (
                <li key={s.title}>
                  <Link
                    href={s.href}
                    className="flex h-full gap-3 rounded-lg border p-3 transition hover:border-primary/40 hover:bg-accent/40"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 space-y-0.5">
                      <span className="block font-medium">{s.title}</span>
                      <span className="block text-sm text-muted-foreground">{s.body}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </GuideSection>

          <GuideSection id="dieu-huong" icon={CompassIcon} title="Bố cục & điều hướng">
            <Topic title="Trên máy tính">
              <Bullets>
                <li>
                  Thanh bên trái: nút <Ui icon={PlusIcon}>Bản ghi mới</Ui> ở trên cùng; các trang chính <Ui>Bản ghi</Ui>, <Ui>Nhóm</Ui>,{" "}
                  <Ui>Trò chuyện</Ui> (kèm số tin chưa đọc), <Ui>Ghi chú</Ui>; mục <b>Công cụ</b> gồm <Ui>Template tổng hợp</Ui>,{" "}
                  <Ui>Từ điển thuật ngữ</Ui>, <Ui>Cài đặt</Ui>, <Ui>Hướng dẫn</Ui>. Mục <Ui>Quản trị</Ui> chỉ hiện với quản trị viên.
                </li>
                <li>Góc dưới thanh bên là tên và email của bạn — bấm vào để mở menu cá nhân.</li>
              </Bullets>
            </Topic>
            <Topic title="Trên điện thoại">
              <Bullets>
                <li>
                  Thanh dưới cùng: Bản ghi, Nhóm, <b>nút micro tròn ở giữa để ghi âm ngay</b>, Trò chuyện, Ghi chú.
                </li>
                <li>
                  Nút <Ui icon={MenuIcon} label="Mở menu" /> ở góc trên bên trái mở toàn bộ menu (gồm mục Công cụ); ảnh đại diện ở góc
                  trên bên phải mở menu cá nhân.
                </li>
              </Bullets>
            </Topic>
            <Topic title="Menu cá nhân">
              <p>
                <Ui>Cài đặt cá nhân</Ui>, <Ui>Hướng dẫn sử dụng</Ui>, chọn giao diện <Ui>Sáng</Ui> / <Ui>Tối</Ui> /{" "}
                <Ui>Theo hệ thống</Ui> và <Ui>Đăng xuất</Ui>.
              </p>
            </Topic>
            <Callout title="Cài như một ứng dụng trên điện thoại">
              iPhone: mở MeetingAI bằng Safari → nút Chia sẻ → <b>Thêm vào MH chính</b>. Android: mở bằng Chrome → menu ⋮ →{" "}
              <b>Thêm vào màn hình chính</b> (hoặc <b>Cài đặt ứng dụng</b>). Sau đó MeetingAI mở toàn màn hình như ứng dụng thường.
            </Callout>
          </GuideSection>

          <GuideSection id="ban-ghi" icon={AudioLinesIcon} title="Bản ghi" where="Menu Bản ghi — trang mở ra sau khi đăng nhập." href="/recordings">
            <p>Danh sách mọi bản ghi của bạn và bản ghi người khác chia sẻ với bạn, mới nhất ở trên.</p>
            <Topic title="Trên trang có gì">
              <Bullets>
                <li>
                  Nút <Ui icon={MicIcon}>Ghi âm</Ui> và <Ui icon={UploadIcon}>Tải tệp lên</Ui> để tạo bản ghi mới.
                </li>
                <li>
                  Ô tìm kiếm; bộ lọc <Ui>Tất cả</Ui> / <Ui>Của tôi</Ui> / <Ui>Được chia sẻ</Ui>; dải lọc theo loại:{" "}
                  {CATEGORIES.map((c) => c.label).join(", ")}.
                </li>
                <li>
                  Mỗi thẻ bản ghi: loại cuộc họp, trạng thái, tiêu đề, ngày họp, thời lượng, địa điểm; tên người tạo (với bản ghi được chia
                  sẻ); các nhóm đã chia sẻ; nhãn “Không lưu tệp” nếu bản ghi chỉ giữ transcript.
                </li>
              </Bullets>
            </Topic>
            <Topic title="Ý nghĩa trạng thái">
              <DefList
                items={[
                  { term: <Badge variant="success">Sẵn sàng</Badge>, desc: "Đã có transcript." },
                  { term: <Badge variant="secondary">Đang xử lý</Badge>, desc: "AI đang phiên âm." },
                  { term: <Badge variant="muted">Chưa phiên âm</Badge>, desc: "Đã có tệp nhưng chưa phiên âm — mở bản ghi và bấm “Phiên âm”." },
                  { term: <Badge variant="destructive">Lỗi</Badge>, desc: "Phiên âm gặp lỗi — mở bản ghi và bấm “Thử lại”." },
                  {
                    term: (
                      <span className="flex flex-wrap gap-1">
                        <Badge variant="warning">Chưa tải xong</Badge>
                        <Badge variant="warning">Tải lên lỗi</Badge>
                      </span>
                    ),
                    desc: "Tệp chưa lên hết — người tạo mở bản ghi và tải tệp lên lại.",
                  },
                ]}
              />
            </Topic>
            <Topic title="Cách làm">
              <Bullets>
                <li>
                  <b>Tìm bản ghi:</b> gõ từ 2 ký tự trở lên — tìm theo tiêu đề, nhãn, địa điểm, tên nhóm và cả nội dung transcript (tên
                  thuốc, câu nói…). Không cần gõ dấu.
                </li>
                <li>
                  <b>Lọc:</b> bấm <Ui>Của tôi</Ui> hoặc <Ui>Được chia sẻ</Ui>, hoặc chọn một loại cuộc họp.
                </li>
                <li>
                  <b>Mở bản ghi:</b> bấm vào thẻ.
                </li>
              </Bullets>
            </Topic>
          </GuideSection>

          <GuideSection
            id="ban-ghi-moi"
            icon={MicIcon}
            title="Bản ghi mới"
            where="Nút Bản ghi mới trên thanh bên, nút Ghi âm / Tải tệp lên ở trang Bản ghi, hoặc nút micro trên điện thoại."
            href="/recordings/new"
          >
            <p>
              Đưa âm thanh vào hệ thống để AI phiên âm. Trang gồm 3 phần: <b>1. Nguồn âm thanh</b>, <b>2. Thông tin cuộc họp</b>,{" "}
              <b>3. Xử lý bằng AI</b>.
            </p>
            <Topic title="Cách 1 — Tải tệp ghi âm có sẵn">
              <Steps>
                <li>
                  Ở phần 1, chọn tab <Ui icon={UploadCloudIcon}>Tải tệp lên</Ui>, kéo thả tệp vào khung hoặc bấm để chọn. Nhận m4a (Voice
                  Memos trên iPhone), mp3, wav, aac, ogg, flac, webm, mp4…, tối đa 2 GB.
                </li>
                <li>Tiêu đề và ngày họp được điền sẵn theo tên và ngày của tệp — sửa lại cho đúng.</li>
                <li>Điền phần 2 — Thông tin cuộc họp (xem bên dưới).</li>
                <li>
                  Bấm <Ui>Lưu & phiên âm</Ui>. Giữ trang mở đến khi tải lên xong (thanh phần trăm); muốn dừng thì bấm <Ui>Huỷ</Ui>. Tải
                  xong, ứng dụng tự chuyển sang trang bản ghi.
                </li>
              </Steps>
            </Topic>
            <Topic title="Cách 2 — Ghi âm trực tiếp trên điện thoại hoặc máy tính">
              <Steps>
                <li>
                  Chọn tab <Ui icon={MicIcon}>Ghi âm</Ui> → <Ui>Bắt đầu ghi âm</Ui> → cho phép trình duyệt dùng micro.
                </li>
                <li>
                  Dùng <Ui>Tạm dừng</Ui> / <Ui>Tiếp tục</Ui> khi cần; kết thúc bấm <Ui>Dừng & lưu</Ui>.
                </li>
                <li>
                  Điền thông tin cuộc họp rồi bấm <Ui>Lưu & phiên âm</Ui>.
                </li>
              </Steps>
              <Callout>
                Đặt máy gần người phát biểu và giữ màn hình mở trong khi ghi. Âm thanh được lưu tạm trên trình duyệt sau mỗi 5 giây: nếu
                trình duyệt bị tắt đột ngột, mở lại tab Ghi âm sẽ thấy “Có một bản ghi âm chưa lưu” — bấm <b>Khôi phục</b>.
              </Callout>
            </Topic>
            <Topic title="Phần 2 — Thông tin cuộc họp">
              <Bullets>
                <li>
                  <b>Tiêu đề</b> (bắt buộc), <b>Loại</b>, <b>Ngày họp</b>, <b>Địa điểm</b>.
                </li>
                <li>
                  <b>Thành phần tham dự</b> — quan trọng nhất để gắn đúng tên: ghi tên kèm vai trò, ví dụ “Thầy Hiển (chủ tọa), BS Quang
                  (nội trú, trình bày), BS Hào”. AI dựa vào đây để gán tên người nói, kể cả khi tên không được gọi trong buổi họp.
                </li>
                <li>
                  <b>Ghi chú / chủ đề</b> (tuỳ chọn) và <b>Nhãn</b> (cách nhau bởi dấu phẩy, dùng để tìm kiếm).
                </li>
              </Bullets>
            </Topic>
            <Topic title="Phần 3 — Xử lý bằng AI">
              <Bullets>
                <li>
                  <b>Phiên âm & phân vai ngay</b>: bật sẵn. Tắt nếu chỉ muốn lưu tệp và phiên âm sau (nút đổi thành{" "}
                  <Ui>Lưu bản ghi</Ui>).
                </li>
                <li>
                  <b>Mô hình phiên âm</b>: để mặc định do quản trị viên cấu hình.
                </li>
                <li>
                  <b>Tự tạo văn bản sau khi phiên âm</b>: chọn mẫu để AI soạn văn bản ngay khi phiên âm xong (mặc định theo loại cuộc họp,
                  ví dụ giao ban → “Transcript chi tiết – biên tập & phân vai”); chọn <Ui>Không tạo</Ui> nếu không cần.
                </li>
                <li>
                  <Ui>Tuỳ chọn nâng cao</Ui> (thường không cần đổi): <b>Độ dài mỗi đoạn xử lý</b> (10 phút là khuyên dùng),{" "}
                  <b>Chuẩn hoá âm lượng</b> (chọn “Tăng cường người nói xa micro” khi phòng rộng, người nói ở xa máy), <b>Khử nhiễu</b>{" "}
                  (không khuyến nghị — thường làm tăng lỗi nhận dạng), <b>Quét bổ sung khoảng bị bỏ sót</b>,{" "}
                  <b>Nhận diện tên người nói</b>, <b>Hiệu đính thuật ngữ bằng AI</b> (chỉ sửa tên thuốc, thuật ngữ nhận dạng sai; không
                  viết lại câu).
                </li>
              </Bullets>
            </Topic>
            <Callout tone="warn" title="Khi chưa kết nối Google Drive">
              Trang hiện cảnh báo “Chưa kết nối Google Drive — tệp ghi âm sẽ không được lưu”. Bạn vẫn phiên âm được: tệp (tối đa{" "}
              {tempLimit}) chỉ được giữ tạm để phiên âm rồi tự xoá, bản ghi giữ lại transcript; nút đổi thành{" "}
              <b>Phiên âm (không lưu tệp)</b>. Với bản vừa ghi âm, bấm <b>Tải bản ghi âm về máy</b> để giữ một bản sao. Nếu tải lên Drive
              lỗi giữa chừng, chọn <b>Thử lại</b> hoặc <b>Phiên âm, không lưu tệp</b>.
            </Callout>
          </GuideSection>

          <GuideSection id="chi-tiet" icon={ScrollTextIcon} title="Trang chi tiết bản ghi" where="Bấm vào một bản ghi trong danh sách Bản ghi.">
            <p>
              Nơi làm việc chính với một buổi họp: nghe lại, đọc và sửa transcript, tạo văn bản, hỏi đáp AI, ghi chú và chia sẻ.
            </p>
            <Topic title="Bố cục">
              <Bullets>
                <li>
                  Đầu trang: <Ui icon={ArrowLeftIcon}>Bản ghi</Ui> để quay lại danh sách; tiêu đề; loại, trạng thái, ngày, thời lượng, địa
                  điểm, số người nói.
                </li>
                <li>
                  Máy tính: transcript ở cột trái; cột phải có các tab <Ui icon={FileTextIcon}>Văn bản</Ui>,{" "}
                  <Ui icon={MessageSquareTextIcon}>Hỏi đáp</Ui>, <Ui icon={NotebookPenIcon}>Ghi chú</Ui> và{" "}
                  <Ui icon={InfoIcon} label="Thông tin" /> (Thông tin).
                </li>
                <li>
                  Điện thoại: các tab <Ui>Transcript</Ui>, <Ui>Văn bản</Ui>, <Ui>Hỏi đáp</Ui>, <Ui>Ghi chú</Ui>,{" "}
                  <Ui icon={InfoIcon} label="Thông tin" />.
                </li>
              </Bullets>
            </Topic>
            <Topic title="Các nút lệnh ở đầu trang">
              <Bullets>
                <li>
                  <Ui icon={Share2Icon}>Chia sẻ</Ui> — chia sẻ cho nhóm hoặc từng người (xem <a href="#chia-se" className="text-primary hover:underline">Chia sẻ & quyền</a>).
                </li>
                <li>
                  <Ui icon={DownloadIcon}>Xuất</Ui> — tải transcript dạng Word (.docx), Markdown (.md), Văn bản (.txt), Phụ đề (.srt), Phụ
                  đề web (.vtt).
                </li>
                <li>
                  <Ui icon={WandSparklesIcon}>Phiên âm</Ui> / <Ui icon={WandSparklesIcon}>Phiên âm lại</Ui> — chọn mô hình và tuỳ chọn
                  (giống trang Bản ghi mới, thêm <b>Phân vai bằng giọng mẫu</b>: bật sẵn, phân biệt người nói chính xác hơn nhưng chậm
                  hơn), rồi bấm <Ui>Bắt đầu</Ui>.
                </li>
                <li>
                  <Ui icon={MoreHorizontalIcon} label="Thêm" /> — <Ui icon={RotateCcwIcon}>Khôi phục bản máy gốc</Ui> (bỏ mọi chỉnh sửa, quay
                  về kết quả AI ban đầu) và <Ui icon={Trash2Icon}>Xoá bản ghi</Ui> (chỉ người tạo; tệp trên Google Drive được chuyển vào
                  Thùng rác).
                </li>
              </Bullets>
              <Callout tone="warn">
                Phiên âm lại sẽ thay toàn bộ transcript hiện tại, kể cả phần bạn đã hiệu đính. Tệp âm thanh gốc không thay đổi.
              </Callout>
            </Topic>
            <Topic title="Theo dõi tiến độ phiên âm">
              <Bullets>
                <li>
                  Khi đang phiên âm, trang hiện thanh tiến độ với bước đang làm và phần trăm. Có thể rời trang — máy chủ vẫn xử lý;
                  transcript tự hiện khi xong.
                </li>
                <li>
                  Nếu hiện <b>Phiên âm gặp lỗi</b>: bấm <Ui icon={RefreshCwIcon}>Thử lại</Ui> — hệ thống xử lý tiếp các đoạn còn thiếu, giữ
                  nguyên phần đã xong. Hoặc <Ui>Phiên âm lại</Ui> với mô hình khác.
                </li>
                <li>
                  Nếu độ phủ tiếng nói dưới 90%, trang hiện thẻ <b>Kiểm soát chất lượng</b> cho biết còn những khoảng có tiếng nói nhưng
                  chưa có chữ — nên nghe lại các đoạn đó.
                </li>
              </Bullets>
            </Topic>

            <Topic id="trinh-phat" title="Trình phát âm thanh">
              <Bullets>
                <li>
                  <Ui icon={RotateCcwIcon} label="Lùi 10 giây" /> / <Ui icon={RotateCwIcon} label="Tới 10 giây" /> lùi hoặc tới 10 giây;{" "}
                  <Ui icon={PlayIcon} label="Phát" /> phát / tạm dừng; nút <Ui>1×</Ui> chọn tốc độ từ 0,75× đến 2×.
                </li>
                <li>
                  Thanh thời gian tô màu theo người nói — bấm hoặc kéo để tua. Trình phát luôn nằm ở đầu vùng làm việc khi bạn cuộn.
                </li>
                <li>
                  Bản ghi không lưu tệp thì chỗ trình phát là thông báo “Không lưu tệp ghi âm” hoặc “Chưa có tệp ghi âm”: người tạo bấm{" "}
                  <Ui icon={UploadCloudIcon}>Tải tệp ghi âm lên</Ui> để nghe lại theo từng câu (và phiên âm lại nếu muốn).
                </li>
              </Bullets>
            </Topic>

            <Topic id="transcript" title="Đọc transcript">
              <Bullets>
                <li>Hàng trên cùng liệt kê người nói: màu, tên và tổng thời gian nói (18″ = 18 giây, 12′ = 12 phút).</li>
                <li>
                  Mỗi lượt lời gồm mốc thời gian, tên người nói và nội dung. <b>Bấm vào mốc thời gian hoặc bất kỳ câu nào để nghe đúng đoạn
                  đó</b>; câu đang phát được tô nền.
                </li>
                <li>
                  Ô <Ui icon={SearchIcon}>Tìm trong transcript (không cần dấu)…</Ui> hiện số kết quả; dùng mũi tên ↑ ↓ để chuyển giữa các
                  kết quả.
                </li>
                <li>
                  <Ui icon={CrosshairIcon}>Theo dõi</Ui>: tự cuộn theo câu đang phát (tạm ngừng 5 giây khi bạn tự cuộn).
                </li>
                <li>
                  Ký hiệu trong câu: <SparklesIcon aria-label="Biểu tượng lấp lánh" className="inline size-3.5 text-primary" /> câu được
                  bổ sung ở lượt quét khoảng bị bỏ sót; <InfoIcon aria-label="Biểu tượng thông tin" className="inline size-3.5 text-primary" />{" "}
                  AI đã hiệu đính thuật ngữ trong câu;{" "}
                  <span className="underline decoration-warning decoration-dotted underline-offset-4">gạch chân chấm</span> — AI chưa chắc
                  chắn, nên nghe lại.
                </li>
              </Bullets>
            </Topic>

            <Topic id="hieu-dinh" title="Hiệu đính transcript & người nói">
              <p className="text-sm text-muted-foreground">Dành cho người tạo bản ghi và người được chia sẻ quyền “Được sửa”.</p>
              <Task title="Đổi tên, vai trò người nói">
                <Steps>
                  <li>Bấm vào tên người nói (ở hàng trên cùng hoặc đầu một lượt lời).</li>
                  <li>
                    Nhập <b>Tên hiển thị</b> (ví dụ “Thầy Hiển”) và <b>Vai trò</b> (ví dụ “Chủ tọa”).
                  </li>
                  <li>
                    Bấm <Ui>Lưu</Ui> — tên mới áp dụng cho toàn bộ transcript.
                  </li>
                </Steps>
              </Task>
              <Task title="Gộp hai người nói (AI tách nhầm một người thành hai)">
                <p>
                  Trong cùng hộp thoại, chọn người ở mục <b>Gộp vào người nói khác</b> rồi bấm{" "}
                  <Ui>Gộp toàn bộ câu của “…” vào người đã chọn</Ui>.
                </p>
              </Task>
              <Task title="Gộp người nói ít lời">
                <p>
                  Bấm <Ui icon={CombineIcon}>Gộp N người nói ít lời thành “Thành viên khác”</Ui> — nút hiện khi có từ 2 người chưa rõ tên,
                  mỗi người nói tổng cộng dưới 20 giây (chào hỏi, “vâng”, “dạ”…).
                </p>
              </Task>
              <Task title="Sửa từng câu">
                <Steps>
                  <li>
                    Bấm <Ui icon={PencilIcon}>Hiệu đính</Ui> — mỗi câu thành một ô soạn thảo.
                  </li>
                  <li>
                    Sửa chữ rồi bấm <Ui>Lưu</Ui> (hoặc <Ui>Huỷ</Ui>).
                  </li>
                  <li>
                    Trên mỗi câu còn có <Ui icon={UserRoundIcon}>Đổi người nói</Ui> (chọn người khác hoặc <Ui>+ Người nói mới…</Ui>),{" "}
                    <Ui>+ Ghi chú</Ui> (ghi chú gắn đúng thời điểm của câu) và <Ui icon={Trash2Icon} label="Xoá câu" /> để xoá câu.
                  </li>
                  <li>
                    Bấm lại nút <Ui icon={PencilIcon}>Đang hiệu đính</Ui> để thoát chế độ sửa.
                  </li>
                </Steps>
              </Task>
              <Callout tone="info">
                Chỉnh sửa được lưu tự động (hiện “Đang lưu…”). Bản máy gốc luôn được giữ: muốn làm lại từ đầu thì bấm{" "}
                <b>⋯ → Khôi phục bản máy gốc</b>.
              </Callout>
            </Topic>

            <Topic id="van-ban" title="Tab Văn bản — văn bản tổng hợp">
              <Task title="Tạo văn bản">
                <Steps>
                  <li>
                    Bấm <Ui icon={PlusIcon}>Tạo văn bản tổng hợp</Ui>.
                  </li>
                  <li>
                    Chọn mẫu: mẫu có nhãn <Badge variant="secondary">Gợi ý</Badge> hợp với loại cuộc họp; mẫu riêng của bạn, nhóm hoặc đơn
                    vị nằm ở mục <b>Template tuỳ chỉnh</b>.
                  </li>
                  <li>
                    <b>Mô hình AI</b>: để mặc định. Công tắc <b>Chia sẻ với người xem bản ghi</b>: tắt nếu chỉ muốn mình bạn thấy (văn bản
                    có nhãn <Badge variant="muted">Riêng tư</Badge>).
                  </li>
                  <li>
                    Bấm <Ui>Tạo văn bản</Ui>. Văn bản hiện dần trên màn hình (“AI đang soạn văn bản…”); có thể rời trang, danh sách tự cập
                    nhật khi xong.
                  </li>
                </Steps>
              </Task>
              <Task title="Làm việc với một văn bản (bấm vào văn bản trong danh sách)">
                <Bullets>
                  <li>
                    <Ui icon={FileDownIcon}>DOCX</Ui> — tải file Word.
                  </li>
                  <li>
                    <Ui>Khác</Ui> — <Ui>Sao chép Markdown</Ui>, <Ui>Tải .md</Ui>, <Ui>In / Lưu PDF</Ui>, <Ui>Tạo lại (bản mới)</Ui>,{" "}
                    <Ui>Xoá</Ui>.
                  </li>
                  <li>
                    <Ui icon={PencilIcon}>Sửa</Ui> — chỉnh nội dung (định dạng Markdown: <Code>#</Code> tiêu đề, <Code>**đậm**</Code>,{" "}
                    <Code>-</Code> gạch đầu dòng) rồi <Ui>Lưu</Ui>.
                  </li>
                  <li>Mốc thời gian trong văn bản bấm được để nghe lại đoạn tương ứng.</li>
                  <li>
                    Văn bản có nhãn <Badge variant="destructive">Lỗi</Badge>: mở ra sẽ thấy “Tạo văn bản thất bại” kèm lý do — bấm{" "}
                    <Ui icon={RefreshCwIcon}>Tạo lại</Ui> (thay bản lỗi) hoặc <Ui icon={Trash2Icon}>Xoá</Ui>.
                  </li>
                </Bullets>
              </Task>
              <Task title={`${SYSTEM_TEMPLATES.length} mẫu có sẵn`}>
                <DefList items={SYSTEM_TEMPLATES.map((t) => ({ term: t.name, desc: t.description }))} />
              </Task>
            </Topic>

            <Topic id="hoi-dap" title="Tab Hỏi đáp — hỏi AI về nội dung">
              <Bullets>
                <li>
                  Cần có transcript. Gõ câu hỏi rồi nhấn <Kbd>Enter</Kbd> (<Kbd>Shift</Kbd> + <Kbd>Enter</Kbd> để xuống dòng), hoặc bấm
                  một câu hỏi gợi ý như “Tóm tắt các ý chính của buổi họp”, “Chủ tọa đã kết luận những gì?”.
                </li>
                <li>
                  AI trả lời dựa trên nội dung bản ghi, kèm <b>mốc thời gian — bấm để nghe đúng đoạn đó</b>.
                </li>
                <li>
                  Dưới câu trả lời: <Ui icon={CopyIcon}>Sao chép</Ui> và <Ui icon={BookmarkPlusIcon}>Lưu vào ghi chú</Ui> (nội dung chuyển
                  sang tab Ghi chú — bấm “Thêm ghi chú” để lưu).
                </li>
                <li>
                  <Ui icon={SquareIcon} label="Dừng" /> dừng khi AI đang trả lời; <Ui icon={HistoryIcon} label="Lịch sử hỏi đáp" /> mở lại
                  hội thoại trước; <Ui icon={PlusIcon} label="Hội thoại mới" /> bắt đầu hội thoại mới; ô chọn mô hình ở trên cùng (để mặc
                  định).
                </li>
                <li>Hội thoại hỏi đáp là riêng tư — người khác không xem được.</li>
              </Bullets>
            </Topic>

            <Topic id="ghi-chu-ban-ghi" title="Tab Ghi chú">
              <Bullets>
                <li>Ghi chú riêng của bạn cho bản ghi này (chỉ bạn thấy), hỗ trợ Markdown.</li>
                <li>
                  Bấm <Ui icon={ClockIcon}>Gắn mốc thời gian</Ui> để gắn ghi chú vào thời điểm đang phát; ghi chú sẽ có nút ▶ mốc thời gian
                  để nghe lại.
                </li>
                <li>
                  <Ui icon={PlusIcon}>Thêm ghi chú</Ui> (hoặc <Kbd>Ctrl</Kbd>/<Kbd>⌘</Kbd> + <Kbd>Enter</Kbd>).{" "}
                  <Ui icon={PinIcon} label="Ghim" /> ghim lên đầu, <Ui icon={Trash2Icon} label="Xoá" /> xoá, <b>bấm đúp</b> vào nội dung để
                  sửa.
                </li>
                <li>
                  Mọi ghi chú cũng xem được ở trang{" "}
                  <Link href="/notes" className="text-primary hover:underline">
                    Ghi chú
                  </Link>
                  .
                </li>
              </Bullets>
            </Topic>

            <Topic id="thong-tin" title="Tab Thông tin">
              <Bullets>
                <li>
                  Sửa tiêu đề, loại, ngày họp, địa điểm, thành phần tham dự, ghi chú/chủ đề, nhãn → <Ui>Lưu thông tin</Ui> (cần quyền
                  sửa).
                </li>
                <li>
                  Thông tin tệp: tên tệp gốc, nơi lưu trữ (Google Drive / tệp tạm / không lưu tệp), dung lượng, thời lượng, định dạng,
                  thời điểm tạo, mô hình đã phiên âm.
                </li>
                <li>
                  Thẻ <b>Kiểm soát chất lượng</b>: độ phủ tiếng nói (bao nhiêu phút có tiếng nói đã có chữ), số khoảng quét bổ sung tìm lại
                  được, số câu trùng / vòng lặp đã loại, các khoảng từ 8 giây trở lên có âm thanh nhưng không có chữ.
                </li>
              </Bullets>
              <Callout>
                Tên người nói bị gán sai nhiều: bổ sung <b>Thành phần tham dự</b> (kèm vai trò) ở tab này, bấm <b>Lưu thông tin</b> rồi{" "}
                <b>Phiên âm lại</b>.
              </Callout>
            </Topic>

            <Topic id="chia-se" title="Chia sẻ & quyền">
              <Steps>
                <li>
                  Người tạo bản ghi bấm <Ui icon={Share2Icon}>Chia sẻ</Ui>.
                </li>
                <li>
                  <b>Chia sẻ vào nhóm</b>: chọn nhóm, chọn quyền, bấm <Ui>Chia sẻ</Ui>. Để bật <b>Thông báo vào kênh chat của nhóm</b> nếu
                  muốn cả nhóm nhận tin.
                </li>
                <li>
                  <b>Chia sẻ với một người</b>: gõ tên hoặc email rồi bấm vào người cần chia sẻ (áp dụng quyền đang chọn).
                </li>
                <li>
                  Ở danh sách <b>Đang chia sẻ với</b>: đổi quyền, hoặc bấm <Ui icon={Trash2Icon} label="Bỏ chia sẻ" /> để ngừng chia sẻ.
                </li>
              </Steps>
              <DefList
                items={[
                  {
                    term: "Chỉ xem",
                    desc: "Nghe âm thanh, đọc transcript, xem văn bản tổng hợp được chia sẻ, hỏi đáp AI, tạo văn bản và ghi chú của riêng mình.",
                  },
                  {
                    term: "Được sửa",
                    desc: "Như Chỉ xem, thêm: hiệu đính transcript, đổi tên / gộp người nói, sửa thông tin cuộc họp, phiên âm lại.",
                  },
                  { term: "Người tạo bản ghi", desc: "Toàn quyền, gồm chia sẻ / ngừng chia sẻ và xoá bản ghi." },
                ]}
              />
            </Topic>
          </GuideSection>

          <GuideSection id="nhom" icon={UsersIcon} title="Nhóm" where="Menu Nhóm." href="/groups">
            <p>
              Nhóm theo khoa/phòng, tổ chuyên môn hoặc hội đồng: chia sẻ bản ghi cho cả nhóm, hỏi AI trên nhiều buổi họp cùng lúc và trò
              chuyện chung.
            </p>
            <Topic title="Trang danh sách nhóm">
              <Bullets>
                <li>Các nhóm bạn tham gia, vai trò của bạn (Chủ nhóm / Quản trị), số thành viên và số bản ghi.</li>
                <li>
                  <Ui icon={PlusIcon}>Tạo nhóm</Ui>: nhập Tên nhóm, Mô tả → <Ui>Tạo nhóm</Ui>. Người tạo là Chủ nhóm.
                </li>
                <li>
                  <Ui icon={LogInIcon}>Nhập mã mời</Ui>: dán mã hoặc link mời → <Ui>Tham gia</Ui>. Nhận được link mời thì chỉ cần mở link
                  và bấm <Ui>Tham gia nhóm</Ui>.
                </li>
              </Bullets>
            </Topic>
            <Topic title="Bên trong một nhóm">
              <DefList
                items={[
                  {
                    term: (
                      <Ui icon={AudioLinesIcon}>Bản ghi</Ui>
                    ),
                    desc: (
                      <>
                        Bản ghi đã chia sẻ vào nhóm (kèm quyền). <b>Chia sẻ bản ghi của tôi</b> → chọn quyền → bấm <b>Chia sẻ</b> ở từng bản
                        ghi. <b>Gỡ khỏi nhóm</b>: người đã chia sẻ hoặc quản trị nhóm.
                      </>
                    ),
                  },
                  {
                    term: <Ui icon={MessageSquareTextIcon}>Hỏi đáp AI</Ui>,
                    desc: (
                      <>
                        Hỏi trên nhiều bản ghi cùng lúc. Cột <b>Nguồn</b>: bấm chọn bản ghi muốn hỏi, không chọn = dùng tất cả; bấm{" "}
                        <b>Tất cả</b> để bỏ chọn. Bấm mốc thời gian trong câu trả lời để mở đúng bản ghi và đoạn đó. Ví dụ: “Tổng hợp các
                        kết luận chuyên môn qua các buổi giao ban”, “Liệt kê các nhiệm vụ được giao và người phụ trách”.
                      </>
                    ),
                  },
                  { term: <Ui icon={MessagesSquareIcon}>Trò chuyện</Ui>, desc: "Kênh chat chung của nhóm." },
                  {
                    term: <Ui icon={UsersIcon}>Thành viên</Ui>,
                    desc: (
                      <>
                        Danh sách thành viên; <b>Link mời tham gia nhóm</b> — bấm <b>Sao chép</b> để gửi cho đồng nghiệp; <b>Rời nhóm</b>.
                      </>
                    ),
                  },
                  {
                    term: <Ui icon={SettingsIcon} label="Cài đặt nhóm" />,
                    desc: (
                      <>
                        Chỉ quản trị nhóm: đổi tên, mô tả → <b>Lưu</b>. Chủ nhóm có thêm <b>Xoá nhóm</b> (bản ghi gốc vẫn còn).
                      </>
                    ),
                  },
                ]}
              />
            </Topic>
            <Topic title="Dành cho chủ nhóm và quản trị nhóm">
              <Bullets>
                <li>
                  Bật/tắt <b>Cho phép tham gia bằng link</b>; <Ui icon={RefreshCwIcon} label="Tạo mã mới" /> tạo mã mời mới (link cũ hết
                  hiệu lực).
                </li>
                <li>
                  <b>Thêm thành viên (người đã có tài khoản)</b>: tìm theo tên hoặc email rồi bấm để thêm. Người chưa có tài khoản: gửi
                  link mời — họ đăng nhập rồi tự tham gia.
                </li>
                <li>
                  Đổi vai trò <Ui>Thành viên</Ui> / <Ui>Quản trị</Ui>, hoặc xoá thành viên khỏi nhóm.
                </li>
              </Bullets>
            </Topic>
          </GuideSection>

          <GuideSection
            id="tro-chuyen"
            icon={MessagesSquareIcon}
            title="Trò chuyện"
            where="Menu Trò chuyện — số tin chưa đọc hiện cạnh tên menu."
            href="/chat"
          >
            <p>Nhắn tin riêng với đồng nghiệp và trong kênh của từng nhóm, có thể đính kèm bản ghi.</p>
            <Bullets>
              <li>Danh sách cuộc trò chuyện (kênh nhóm và tin nhắn riêng) kèm tin gần nhất — bấm để mở.</li>
              <li>
                <Ui icon={PenSquareIcon}>Tin nhắn mới</Ui>: tìm đồng nghiệp theo tên, email, khoa/phòng → bấm để bắt đầu trò chuyện riêng.
              </li>
              <li>
                Gõ vào ô <b>Nhập tin nhắn…</b>, nhấn <Kbd>Enter</Kbd> để gửi (<Kbd>Shift</Kbd> + <Kbd>Enter</Kbd> để xuống dòng).
              </li>
              <li>
                <Ui icon={PaperclipIcon} label="Đính kèm bản ghi" /> đính kèm bản ghi — người nhận chỉ mở được nếu đã được chia sẻ quyền
                xem bản ghi đó.
              </li>
              <li>
                Với tin của mình: <Ui icon={PencilIcon} label="Sửa" /> sửa (tin hiện “đã sửa”), <Ui icon={Trash2Icon} label="Thu hồi" /> thu
                hồi.
              </li>
              <li>
                Bấm <Ui>Tải tin nhắn cũ hơn</Ui> ở đầu cuộc trò chuyện để xem tin cũ. Kênh nhóm có liên kết <Ui icon={UsersIcon}>Nhóm</Ui>{" "}
                để mở trang nhóm.
              </li>
            </Bullets>
          </GuideSection>

          <GuideSection id="ghi-chu" icon={NotebookPenIcon} title="Ghi chú" where="Menu Ghi chú." href="/notes">
            <p>Tập hợp mọi ghi chú cá nhân của bạn — chỉ bạn thấy.</p>
            <Bullets>
              <li>
                Ô <b>Ghi chú nhanh (không gắn bản ghi)…</b> → <Ui icon={PlusIcon}>Thêm</Ui> để ghi nhanh một việc.
              </li>
              <li>Ghi chú tạo trong bản ghi có tên bản ghi (và mốc thời gian): bấm để mở đúng bản ghi và nghe tại mốc đó.</li>
              <li>
                Ô <b>Tìm trong ghi chú…</b>; <Ui icon={PinIcon} label="Ghim" /> ghim; <Ui icon={Trash2Icon} label="Xoá" /> xoá.
              </li>
            </Bullets>
          </GuideSection>

          <GuideSection id="template" icon={FileTextIcon} title="Template tổng hợp" where="Công cụ → Template tổng hợp." href="/templates">
            <p>
              Template là hướng dẫn cho AI biết phải soạn văn bản theo cấu trúc, mục bắt buộc và văn phong nào. AI luôn chỉ dùng thông tin
              có trong transcript.
            </p>
            <Topic title="Trên trang có gì">
              <Bullets>
                <li>
                  <b>Template hệ thống</b> (<LockIcon aria-label="khoá" className="inline size-3.5" /> không sửa trực tiếp):{" "}
                  {SYSTEM_TEMPLATES.length} mẫu có sẵn. Bấm <Ui icon={CopyIcon}>Nhân bản để tuỳ chỉnh</Ui> để tạo bản riêng từ một mẫu.
                </li>
                <li>
                  <b>Template tuỳ chỉnh</b>: mẫu của bạn, của nhóm hoặc toàn đơn vị; mẫu bạn quản lý có nút <Ui icon={PencilIcon}>Sửa</Ui>{" "}
                  và nút xoá.
                </li>
              </Bullets>
            </Topic>
            <Topic title="Tạo template">
              <Steps>
                <li>
                  Bấm <Ui icon={PlusIcon}>Tạo template</Ui> (hoặc nhân bản một mẫu hệ thống).
                </li>
                <li>
                  Nhập <b>Tên</b>, chọn <b>Loại cuộc họp</b> và <b>Phạm vi</b>: Cá nhân (chỉ bạn) hoặc Nhóm (thành viên nhóm dùng chung —
                  chọn nhóm). Phạm vi Toàn đơn vị chỉ quản trị viên tạo được.
                </li>
                <li>
                  Viết <b>Mô tả ngắn</b> và <b>Hướng dẫn cho AI</b>: các mục cần có, thứ tự, văn phong, độ dài. Có thể chèn{" "}
                  <Code>{"{{ORG_NAME}}"}</Code> (tên đơn vị), <Code>{"{{ORG_PARENT}}"}</Code> (cơ quan chủ quản),{" "}
                  <Code>{"{{ORG_SHORT}}"}</Code> (tên viết tắt).
                </li>
                <li>
                  Bấm <Ui>Lưu</Ui>. Mẫu xuất hiện ở mục “Template tuỳ chỉnh” khi tạo văn bản tổng hợp.
                </li>
              </Steps>
            </Topic>
          </GuideSection>

          <GuideSection id="tu-dien" icon={BookTextIcon} title="Từ điển thuật ngữ" where="Công cụ → Từ điển thuật ngữ." href="/glossary">
            <p>
              Giúp AI viết đúng tên thuốc, thuật ngữ, viết tắt và tên đồng nghiệp khi phiên âm, hiệu đính và soạn văn bản. Hệ thống có sẵn{" "}
              {DEFAULT_GLOSSARY.length} thuật ngữ y khoa (ưu tiên Gây mê hồi sức); bạn bổ sung những từ riêng của khoa mình.
            </p>
            <Topic title="Thêm một thuật ngữ">
              <Steps>
                <li>
                  <b>Thuật ngữ / tên đúng chính tả</b>: ví dụ “Esmeron”, “BS. Nguyễn Văn Hiển”.
                </li>
                <li>
                  <b>Cách đọc/nghe nhầm</b> (cách nhau bởi dấu phẩy): ví dụ “ét mê rôn, ếch mê rông”.
                </li>
                <li>
                  <b>Nhóm từ</b> (tuỳ chọn: thuốc, nhân sự…) và phạm vi <Ui>Cá nhân</Ui> hoặc <Ui>Nhóm</Ui> → bấm <Ui icon={PlusIcon}>Thêm</Ui>.
                </li>
              </Steps>
            </Topic>
            <Topic title="Chức năng khác">
              <Bullets>
                <li>
                  <Ui icon={UploadIcon}>Nhập hàng loạt</Ui>: dán nhiều dòng, mỗi dòng <Code>Thuật ngữ | cách đọc 1, cách đọc 2 | nhóm từ</Code>{" "}
                  (hai phần sau có thể bỏ trống) → <Ui>Nhập</Ui>.
                </li>
                <li>Tìm trong danh sách, xoá thuật ngữ không cần; xem danh sách “Từ điển mặc định của hệ thống” ở cuối trang.</li>
              </Bullets>
            </Topic>
            <Callout tone="info">
              Từ điển áp dụng cho các lần phiên âm và tạo văn bản sau khi thêm. Transcript đã có không tự thay đổi — sửa bằng Hiệu đính hoặc
              Phiên âm lại.
            </Callout>
          </GuideSection>

          <GuideSection
            id="cai-dat"
            icon={SettingsIcon}
            title="Cài đặt cá nhân"
            where="Công cụ → Cài đặt, hoặc menu cá nhân → Cài đặt cá nhân."
            href="/settings"
          >
            <Topic title="Hồ sơ">
              <p>
                <b>Họ và tên</b>, <b>Chức danh</b> (BS, ThS.BS, CN…), <b>Khoa / phòng</b> → <Ui>Lưu hồ sơ</Ui>. Thông tin này giúp đồng
                nghiệp tìm đúng bạn khi chia sẻ, thêm vào nhóm, nhắn tin.
              </p>
            </Topic>
            <Topic title="Kết nối AI cá nhân (không bắt buộc)">
              <Bullets>
                <li>Mặc định bạn dùng kết nối AI chung của đơn vị — không cần làm gì.</li>
                <li>
                  Nếu có khoá API riêng (ví dụ tài khoản Claude, DeepSeek cá nhân): <Ui icon={PlusIcon}>Thêm kết nối</Ui> → chọn nhà cung
                  cấp, đặt <b>Tên kết nối</b>, dán <b>API key</b>, chọn <b>Mô hình</b> → <Ui>Lưu & kiểm tra</Ui>. Kết nối phải ở trạng thái{" "}
                  <Badge variant="success">Hoạt động</Badge> mới dùng được; <Ui icon={PlugZapIcon}>Kiểm tra</Ui> để kiểm tra lại. Khoá được
                  mã hoá, chỉ bạn dùng.
                </li>
              </Bullets>
            </Topic>
            <Topic title="Phân công mô hình của tôi">
              <p>
                Chọn kết nối cho từng việc: {USAGES.map((u) => u.label).join(", ")}. Để <Ui>Theo hệ thống</Ui> để dùng cấu hình chung của
                đơn vị (nên dùng khi bạn không có khoá riêng).
              </p>
            </Topic>
            <Topic title="Giao diện & đăng xuất">
              <p>
                Bấm tên hoặc ảnh đại diện để mở menu cá nhân: chọn giao diện Sáng / Tối / Theo hệ thống, hoặc{" "}
                <Ui icon={LogOutIcon}>Đăng xuất</Ui>.
              </p>
            </Topic>
          </GuideSection>

          <GuideSection id="meo" icon={LightbulbIcon} title="Mẹo để transcript chính xác">
            <Steps>
              <li>Đặt máy ghi gần người phát biểu hoặc gần loa của hệ thống âm thanh; không đặt cạnh quạt, điều hoà; không che micro.</li>
              <li>Dùng tệp ghi âm gốc từ máy ghi âm hoặc điện thoại.</li>
              <li>
                Điền <b>Thành phần tham dự</b> kèm vai trò trước khi phiên âm.
              </li>
              <li>Thêm tên thuốc, thuật ngữ, tên đồng nghiệp hay bị nghe nhầm vào Từ điển thuật ngữ.</li>
              <li>
                Giữ các tuỳ chọn mặc định (đoạn 10 phút, quét bổ sung, phân vai bằng giọng mẫu, nhận diện tên người nói). Phòng rộng hoặc
                người nói xa máy: chọn “Tăng cường người nói xa micro”. Không bật Khử nhiễu.
              </li>
              <li>Sau khi phiên âm: xem thẻ Kiểm soát chất lượng (tab Thông tin) và nghe lại các câu gạch chân chấm.</li>
              <li>
                Văn bản tổng hợp chỉ dựa trên transcript: kiểm tra lại tên người, liều thuốc, số liệu trước khi dùng làm văn bản chính thức.
                Mẫu “Transcript chi tiết – biên tập & phân vai” có sẵn mục “Cần đối chiếu âm thanh” liệt kê những chỗ nên nghe lại.
              </li>
            </Steps>
          </GuideSection>

          <GuideSection id="su-co" icon={LifeBuoyIcon} title="Xử lý sự cố thường gặp">
            <div className="space-y-2">
              <Faq q="Phiên âm báo lỗi">
                Mở bản ghi, bấm <b>Thử lại</b> trên thẻ “Phiên âm gặp lỗi” — hệ thống làm tiếp phần còn thiếu, giữ phần đã xong. Vẫn lỗi:
                bấm <b>Phiên âm lại</b> và chọn mô hình khác, hoặc báo quản trị viên kèm nội dung lỗi.
              </Faq>
              <Faq q="Tiến độ phiên âm đứng yên lâu">
                Để trang bản ghi mở: khi tiến độ đứng yên khoảng hơn 1 phút rưỡi, hệ thống tự cho chạy tiếp. Nếu đã đóng trang, mở lại trang
                bản ghi.
              </Faq>
              <Faq q="Văn bản tổng hợp có nhãn “Lỗi”">
                Mở văn bản đó, bấm <b>Tạo lại</b> (chọn sẵn mẫu cũ, thay bản lỗi) hoặc <b>Xoá</b>.
              </Faq>
              <Faq q="Không có trình phát, không nghe lại được">
                Bản ghi không lưu tệp ghi âm. Người tạo bản ghi bấm <b>Tải tệp ghi âm lên</b> ở chỗ trình phát.
              </Faq>
              <Faq q="Tên người nói sai, hoặc một người bị tách thành hai">
                Bấm vào tên người nói để đổi tên hoặc gộp (xem{" "}
                <a href="#hieu-dinh" className="text-primary hover:underline">
                  Hiệu đính
                </a>
                ). Nếu sai nhiều: bổ sung Thành phần tham dự (kèm vai trò) ở tab Thông tin rồi Phiên âm lại.
              </Faq>
              <Faq q="Một câu bị gán nhầm người nói">
                Bấm <b>Hiệu đính</b>, tìm câu đó, bấm <b>Đổi người nói</b> và chọn đúng người.
              </Faq>
              <Faq q="Muốn bỏ hết chỉnh sửa transcript">
                Bấm nút <b>⋯</b> ở đầu trang bản ghi → <b>Khôi phục bản máy gốc</b>.
              </Faq>
              <Faq q="Trình duyệt bị tắt khi đang ghi âm">
                Mở lại <b>Bản ghi mới</b> → tab <b>Ghi âm</b> → bấm <b>Khôi phục</b> ở thông báo “Có một bản ghi âm chưa lưu”.
              </Faq>
              <Faq q="Không dùng được micro">
                Cho phép trang này dùng micro trong cài đặt trình duyệt (biểu tượng ổ khoá hoặc ⓘ cạnh địa chỉ trang), rồi tải lại trang.
              </Faq>
              <Faq q="Thẻ bản ghi hiện “Chưa tải xong” hoặc “Tải lên lỗi”">
                Người tạo mở bản ghi và bấm <b>Tải tệp ghi âm lên</b> để tải lại tệp.
              </Faq>
              <Faq q="Đồng nghiệp gửi bản ghi trong trò chuyện nhưng không mở được">
                Người tạo bản ghi cần chia sẻ bản ghi cho bạn, hoặc chia sẻ vào một nhóm bạn đang tham gia.
              </Faq>
              <Faq q="Tệp ghi âm bị báo quá lớn khi không lưu tệp">
                Khi chưa kết nối Google Drive, tệp giữ tạm để phiên âm tối đa {tempLimit} (tự xoá sau {TEMP_AUDIO_TTL_DAYS} ngày nếu chưa
                phiên âm). Tệp lớn hơn cần quản trị viên kết nối Google Drive.
              </Faq>
              <Faq q="Tài khoản “đang chờ phê duyệt” hoặc “đã bị khoá”">Liên hệ quản trị viên của đơn vị.</Faq>
            </div>
          </GuideSection>

          <GuideSection id="quyen" icon={ShieldCheckIcon} title="Ai thấy được gì?">
            <DefList
              items={[
                {
                  term: "Bản ghi, âm thanh, transcript",
                  desc: (
                    <>
                      <b>Xem:</b> người tạo và người/nhóm được chia sẻ. <b>Sửa:</b> người tạo và người có quyền “Được sửa”.{" "}
                      <b>Xoá bản ghi:</b> chỉ người tạo.
                    </>
                  ),
                },
                {
                  term: "Văn bản tổng hợp",
                  desc: (
                    <>
                      <b>Xem:</b> mọi người xem được bản ghi, trừ văn bản “Riêng tư” (chỉ người tạo văn bản). <b>Sửa, xoá:</b> người tạo văn
                      bản hoặc người có quyền sửa bản ghi.
                    </>
                  ),
                },
                { term: "Hội thoại hỏi đáp AI", desc: "Chỉ bạn." },
                { term: "Ghi chú", desc: "Chỉ bạn." },
                {
                  term: "Tin nhắn",
                  desc: (
                    <>
                      <b>Xem:</b> thành viên cuộc trò chuyện hoặc nhóm. <b>Sửa, thu hồi:</b> người gửi.
                    </>
                  ),
                },
                {
                  term: "Template, từ điển thuật ngữ",
                  desc: "Theo phạm vi: Cá nhân (chỉ bạn), Nhóm (thành viên nhóm), Toàn đơn vị (mọi người). Người tạo sửa được; quản trị nhóm sửa được mục của nhóm.",
                },
              ]}
            />
            <p className="text-sm text-muted-foreground">
              Tệp ghi âm gốc được lưu nguyên vẹn trên Google Drive của đơn vị (khi đã kết nối). Chi tiết:{" "}
              <Link href="/privacy" className="text-primary hover:underline">
                Chính sách quyền riêng tư
              </Link>{" "}
              ·{" "}
              <Link href="/terms" className="text-primary hover:underline">
                Điều khoản sử dụng
              </Link>
              .
            </p>
          </GuideSection>
        </div>

        <aside className="hidden lg:block">
          <Toc items={TOC} className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto" />
        </aside>
      </div>
    </PageContainer>
  );
}
