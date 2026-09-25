/**
 * Template hệ thống cho tổng hợp nội dung (dùng được cả ở client để hiển thị danh sách).
 * Template tuỳ chỉnh của người dùng/nhóm/tổ chức lưu trong bảng `templates`.
 */

export interface ReportTemplate {
  key: string; // "sys:<slug>" hoặc uuid của template tuỳ chỉnh
  name: string;
  description: string;
  categories: string[]; // giao_ban | hop | hoi_nghi | dao_tao | khac | chung
  prompt: string;
  /** Độ dài đầu ra tối thiểu cần dành (token). */
  minOutputTokens?: number;
  system?: boolean;
}

export const REPORT_SYSTEM_PROMPT = `Bạn là thư ký và biên tập viên y khoa chuyên nghiệp của một bệnh viện Việt Nam.
Nhiệm vụ: soạn văn bản theo YÊU CẦU TEMPLATE, dựa DUY NHẤT vào transcript cuộc họp được cung cấp (có mốc thời gian và người nói).

Nguyên tắc bắt buộc:
- Trung thực tuyệt đối: không thêm thông tin, số liệu, tên người, kết luận không có trong transcript. Thông tin cần cho văn bản nhưng không có trong transcript thì để dạng "…" hoặc "[chưa rõ]".
- Giữ chính xác mọi số liệu lâm sàng, liều thuốc, đơn vị, chỉ số xét nghiệm, tên thuốc, thuật ngữ chuyên môn (Latin/Anh giữ nguyên chuẩn).
- Khi transcript có chỗ nhận dạng sai rõ ràng (ví dụ tên thuốc bị viết theo âm đọc), sửa về dạng chuẩn nếu chắc chắn; nếu không chắc thì giữ nguyên và đánh dấu [?].
- Văn phong: tiếng Việt chuẩn mực, trang trọng, súc tích, đúng thuật ngữ chuyên ngành; văn bản hành chính theo thể thức Nghị định 30/2020/NĐ-CP khi template yêu cầu.
- Gọi người nói bằng tên/chức danh đã được xác định. Người chưa rõ tên: gọi "một thành viên" (hoặc theo vai trò thể hiện trong ngữ cảnh, ví dụ "một bác sĩ nội trú"); KHÔNG liệt kê nhãn tự động "Người nói N" như một người tham dự.
- Không tự thêm học hàm, học vị, chức vụ (GS., PGS., TS., Trưởng khoa…) nếu transcript hoặc thông tin cuộc họp không nêu.
- Nhãn người nói do máy phân vai tự động nên có thể nhầm. Chỉ khi chính transcript cho thấy RÕ RÀNG lời nói thuộc người khác (ví dụ ngay sau lời mời "mời bác sĩ X", lời đáp lại bị gán cho người đã trình bày xong; hoặc chủ tọa cảm ơn đích danh người vừa phát biểu) thì ghi đúng người theo ngữ cảnh, thêm dấu (*) sau tên và cuối văn bản ghi: "(*) Người nói được hiệu chỉnh theo ngữ cảnh, khác nhãn phân vai tự động." Không đủ rõ thì giữ nguyên nhãn.
- Định dạng đầu ra: Markdown (tiêu đề #, danh sách, bảng khi cần). Không bọc trong khối code. Không viết lời dẫn hay giải thích ngoài văn bản.`;

export const SYSTEM_TEMPLATES: ReportTemplate[] = [
  {
    key: "sys:transcript-bien-tap",
    name: "Transcript chi tiết – biên tập & phân vai",
    description: "Bản ghi đầy đủ nội dung (không tóm tắt), đã làm sạch, chia mục, gắn tên người nói — tương tự NotebookLM.",
    categories: ["giao_ban", "hop", "hoi_nghi", "dao_tao", "khac"],
    minOutputTokens: 32000,
    prompt: `Soạn "TRANSCRIPT CHI TIẾT" đã biên tập của cuộc họp: văn bản đọc liền mạch, chia theo chủ đề, gắn tên người nói. Đây KHÔNG phải bản tóm tắt: giữ lại toàn bộ nội dung chuyên môn — mọi ý kiến, câu hỏi, câu trả lời, số liệu, liều thuốc, chỉ số và chi tiết lâm sàng.

Cấu trúc:
# TRANSCRIPT CHI TIẾT [TÊN CUỘC HỌP VIẾT HOA]
**Chủ đề:** chủ đề chuyên môn thực sự của buổi họp (ca bệnh, chuyên đề được trình bày), không chỉ ghi loại cuộc họp.
**Ngày:** …
**Thành phần tham dự:** chỉ những người ĐÃ XÁC ĐỊNH TÊN kèm vai trò (Chủ tọa, người trình bày…), sau đó "cùng các thành viên khác" nếu có người chưa rõ tên.

---
Chia 4–7 phần đánh số La Mã THEO CHỦ ĐỀ (không theo từng quãng thời gian). Khung gợi ý cho giao ban / sinh hoạt chuyên môn — điều chỉnh theo nội dung thực tế và loại cuộc họp, bỏ phần không có:
I. MỞ ĐẦU
II. BÁO CÁO CA LÂM SÀNG / NỘI DUNG TRÌNH BÀY (ghi tên người trình bày)
III. NHẬN XÉT CỦA CHỦ TỌA
IV. THẢO LUẬN CHUYÊN MÔN — mỗi người phát biểu một mục con "### 1. Ý kiến của …"; phần chủ tọa bổ sung ngay sau ý kiến đó đặt thành mục con kế tiếp.
V. THẢO LUẬN MỞ RỘNG & BÀI HỌC LÂM SÀNG — câu hỏi phát sinh, hỏi–đáp, kinh nghiệm thực tế.
VI. KẾT LUẬN — một phần duy nhất, ở cuối: kết luận, chỉ đạo của chủ tọa, kế hoạch buổi sau.
Khi chủ tọa hỏi "còn ý kiến gì không?" rồi có người nêu thêm câu hỏi, phần đó thuộc THẢO LUẬN MỞ RỘNG — không tạo phần kết luận ở giữa văn bản. Tên phần phải phản ánh đúng nội dung.

Trình bày:
- Lượt lời: * **Tên người nói (vai trò nếu có)**: nội dung đã làm sạch — bỏ từ đệm, câu lặp, câu vấp và các câu đáp xác nhận vụn ("Vâng.", "Dạ.", "Khoa à?") — nhưng giữ đủ ý và giọng điệu.
- Ý kiến dài của một người: tách thành gạch đầu dòng con, mỗi dòng mở đầu bằng chủ đề in đậm (ví dụ **Thời điểm chuyển tư thế**: …).
- Trình bày ca bệnh hoặc dữ liệu có cấu trúc: mục con ### (Hành chính & Chẩn đoán; Tiền sử & Khám lâm sàng; Cận lâm sàng; Đánh giá nguy cơ; Kế hoạch gây mê & xử trí…) với danh sách gạch đầu dòng, giữ nguyên mọi chỉ số, liều, đơn vị.
- Phần ngoài chuyên môn (chào hỏi, điểm danh, kiểm tra máy chiếu/chuột/micro, đùa vui, nhận xét cá nhân): gộp thành 1–2 dòng in nghiêng trong ngoặc, ví dụ *(Mọi người kiểm tra thiết bị trình chiếu và kết nối trực tuyến.)* — không chép lại từng câu.

Cuối văn bản (chỉ khi có): mục **Cần đối chiếu âm thanh** — tối đa 10 dòng "[mm:ss] cụm từ — lý do" cho các chỗ còn [?] hoặc số liệu, liều thuốc nghi nhận dạng sai, để người đọc nghe lại.

Tuyệt đối không bỏ sót nội dung chuyên môn nào có trong transcript, và không thêm kiến thức không được nói trong buổi họp.`,
  },
  {
    key: "sys:giao-ban",
    name: "Biên bản giao ban chuyên môn",
    description: "Tóm lược diễn biến giao ban: báo cáo, thảo luận, kết luận chủ tọa, bài học, phân công.",
    categories: ["giao_ban"],
    minOutputTokens: 16000,
    prompt: `Soạn "BIÊN BẢN GIAO BAN CHUYÊN MÔN" từ transcript.

# BIÊN BẢN GIAO BAN CHUYÊN MÔN
**Thời gian:** … **Địa điểm:** …
**Chủ trì:** … **Thư ký:** …
**Thành phần tham dự:** …

## I. NỘI DUNG BÁO CÁO
Tóm tắt các báo cáo/ca bệnh được trình bày (người trình bày, thông tin chính: hành chính, chẩn đoán, tiền sử, lâm sàng, cận lâm sàng, phương pháp điều trị/vô cảm, diễn biến). Giữ nguyên số liệu.

## II. Ý KIẾN THẢO LUẬN
Theo từng người phát biểu: **Tên (vai trò)**: các ý chính (gạch đầu dòng, đủ luận điểm chuyên môn).

## III. KẾT LUẬN CỦA CHỦ TỌA
Các kết luận, chỉ đạo chuyên môn (đánh số).

## IV. BÀI HỌC KINH NGHIỆM / ĐIỂM CẦN RÚT KINH NGHIỆM
Danh sách bài học lâm sàng rút ra (chỉ những gì được nêu trong buổi giao ban).

## V. NHIỆM VỤ & PHÂN CÔNG
| STT | Nội dung | Người/bộ phận thực hiện | Thời hạn |
|---|---|---|---|
(chỉ ghi các nhiệm vụ được giao trong buổi; nếu không có, ghi "Không có phân công cụ thể.")`,
  },
  {
    key: "sys:bien-ban-hop-nd30",
    name: "Biên bản cuộc họp (thể thức NĐ 30/2020)",
    description: "Theo Mẫu 1.9, Phụ lục III, Nghị định 30/2020/NĐ-CP về công tác văn thư.",
    categories: ["hop", "giao_ban", "hoi_nghi", "khac"],
    minOutputTokens: 16000,
    prompt: `Soạn BIÊN BẢN cuộc họp theo thể thức Mẫu 1.9, Phụ lục III, Nghị định 30/2020/NĐ-CP. Trình bày bằng Markdown đúng bố cục sau (không dùng thẻ HTML):

| {{ORG_PARENT}} | **CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM** |
|:---:|:---:|
| **{{ORG_NAME}}** | **Độc lập - Tự do - Hạnh phúc** |
| Số: …/BB-{{ORG_SHORT}} | |

**BIÊN BẢN**

**[TÊN CUỘC HỌP VIẾT HOA]**

- Thời gian bắt đầu: … (lấy từ thông tin cuộc họp nếu có, nếu không ghi "…")
- Địa điểm: …
- Thành phần tham dự: …
- Chủ trì (chủ tọa): …
- Thư ký (người ghi biên bản): …

**Nội dung (theo diễn biến cuộc họp):**

1. … (trình bày theo trình tự diễn biến: báo cáo, ý kiến phát biểu của từng người, kết luận của chủ trì; văn phong hành chính, khách quan, câu trần thuật ngôi thứ ba)

*Cuộc họp kết thúc vào … giờ …, ngày … tháng … năm …/.*

| **THƯ KÝ** | **CHỦ TỌA** |
|:---:|:---:|
| *(Chữ ký)* | *(Chữ ký, dấu (nếu có))* |
| | |
| **Họ và tên** | **Họ và tên** |

**Nơi nhận:**
- …;
- Lưu: VT, hồ sơ.

Lưu ý: thay {{ORG_PARENT}}, {{ORG_NAME}}, {{ORG_SHORT}} bằng thông tin đơn vị (nếu trống thì để "…"). Không tự điền số văn bản, không tự điền giờ kết thúc nếu transcript không có.`,
  },
  {
    key: "sys:hoi-nghi",
    name: "Tóm tắt hội nghị / hội thảo khoa học",
    description: "Tóm tắt từng báo cáo khoa học, phần hỏi đáp, khuyến nghị áp dụng.",
    categories: ["hoi_nghi", "dao_tao"],
    minOutputTokens: 16000,
    prompt: `Soạn "BÁO CÁO TÓM TẮT HỘI NGHỊ / HỘI THẢO".

# BÁO CÁO TÓM TẮT: [Tên hội nghị/hội thảo]
**Thời gian – địa điểm:** …  **Chủ trì/Điều phối:** …

## 1. Tổng quan
Mục đích, chủ đề chính, số báo cáo.

## 2. Tóm tắt các báo cáo
Với MỖI báo cáo: ### Tên báo cáo — Báo cáo viên
- **Vấn đề/mục tiêu:** …
- **Phương pháp/nội dung chính:** …
- **Kết quả/số liệu nổi bật:** … (giữ nguyên số liệu)
- **Kết luận/khuyến cáo của báo cáo viên:** …

## 3. Thảo luận – hỏi đáp
Các câu hỏi và trả lời quan trọng (ai hỏi, ai trả lời, nội dung).

## 4. Điểm có thể áp dụng tại đơn vị
Chỉ nêu những điểm được đề cập trong hội nghị; đánh dấu rõ nếu là gợi ý của người biên soạn.

## 5. Kết luận của chủ trì`,
  },
  {
    key: "sys:ket-luan-phan-cong",
    name: "Kết luận & phân công nhiệm vụ",
    description: "Danh sách quyết định, việc cần làm, người phụ trách, thời hạn.",
    categories: ["hop", "giao_ban", "hoi_nghi", "khac"],
    minOutputTokens: 8000,
    prompt: `Trích xuất KẾT LUẬN và NHIỆM VỤ từ cuộc họp.

# KẾT LUẬN & PHÂN CÔNG NHIỆM VỤ — [Tên cuộc họp]

## Các kết luận / quyết định
1. … (kèm mốc thời gian [mm:ss] nơi kết luận được nêu)

## Bảng phân công
| STT | Nội dung công việc | Người/bộ phận thực hiện | Thời hạn | Ghi chú |
|---|---|---|---|---|

## Vấn đề còn bỏ ngỏ / cần xin ý kiến
- …

Chỉ ghi những gì thực sự được nói trong cuộc họp; nếu không nêu thời hạn/người thực hiện thì ghi "chưa xác định".`,
  },
  {
    key: "sys:tom-tat-nhanh",
    name: "Tóm tắt nhanh (1 trang)",
    description: "Những điểm chính, quyết định và việc cần làm — đọc trong 1 phút.",
    categories: ["giao_ban", "hop", "hoi_nghi", "dao_tao", "khac"],
    minOutputTokens: 4000,
    prompt: `Viết "TÓM TẮT NHANH" tối đa khoảng 1 trang:

# Tóm tắt: [Tên cuộc họp]
**Một câu tóm lược:** …

## Điểm chính
- 5–10 gạch đầu dòng, mỗi gạch ≤ 2 dòng, kèm mốc [mm:ss].

## Quyết định / kết luận
- …

## Việc cần làm
- [ ] Việc — người phụ trách — thời hạn (nếu có)`,
  },
  {
    key: "sys:bai-hoc-lam-sang",
    name: "Bài học lâm sàng & câu hỏi ôn tập",
    description: "Tài liệu học tập từ buổi sinh hoạt chuyên môn: bài học chính và câu hỏi tự kiểm tra.",
    categories: ["giao_ban", "dao_tao", "hoi_nghi"],
    minOutputTokens: 12000,
    prompt: `Soạn TÀI LIỆU HỌC TẬP từ buổi sinh hoạt chuyên môn (dành cho bác sĩ nội trú, CKI/CKII).

# Bài học lâm sàng: [Chủ đề]

## 1. Tóm tắt tình huống
## 2. Bài học chính
Mỗi bài học: **Tiêu đề** — giải thích ngắn gọn cơ chế/lý do như đã được thảo luận, người nêu ý kiến, mốc [mm:ss].
## 3. Sai sót thường gặp / lưu ý an toàn người bệnh
## 4. Câu hỏi tự kiểm tra
8–10 câu hỏi (trắc nghiệm 4 lựa chọn hoặc câu hỏi ngắn) bám sát nội dung buổi họp; cuối mục ghi **Đáp án** kèm giải thích ngắn dựa trên nội dung thảo luận.

Chỉ dùng kiến thức được trình bày trong buổi họp; nếu bổ sung kiến thức chung để giải thích, ghi rõ "(bổ sung)".`,
  },
];

export function findSystemTemplate(key: string): ReportTemplate | undefined {
  return SYSTEM_TEMPLATES.find((t) => t.key === key);
}

/** Template gợi ý theo loại cuộc họp (hiển thị trước). */
export function templatesForCategory(category: string): ReportTemplate[] {
  return [...SYSTEM_TEMPLATES].sort((a, b) => {
    const ia = a.categories.includes(category) ? 0 : 1;
    const ib = b.categories.includes(category) ? 0 : 1;
    return ia - ib;
  });
}

export const DEFAULT_AUTO_TEMPLATE: Record<string, string> = {
  giao_ban: "sys:transcript-bien-tap",
  hop: "sys:transcript-bien-tap",
  hoi_nghi: "sys:hoi-nghi",
  dao_tao: "sys:transcript-bien-tap",
  khac: "sys:tom-tat-nhanh",
};
