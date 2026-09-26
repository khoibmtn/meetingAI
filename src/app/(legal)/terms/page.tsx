import type { Metadata } from "next";
import Link from "next/link";
import { getLegalOrg } from "../org";
import { Contact, LegalDoc, List, Section } from "../prose";

export const metadata: Metadata = { title: "Điều khoản sử dụng" };
export const revalidate = 300;

export default async function TermsPage() {
  const org = await getLegalOrg();
  return (
    <LegalDoc title="Điều khoản sử dụng">
      <p>
        MeetingAI là ứng dụng nội bộ {org.name ? <b>của {org.name}</b> : "của đơn vị triển khai"} (“đơn vị”) dùng để ghi âm, phiên âm
        và tổng hợp nội dung giao ban, cuộc họp, hội nghị. Khi sử dụng ứng dụng, bạn đồng ý với các điều khoản dưới đây.
      </p>

      <Section title="1. Đối tượng sử dụng">
        <p>
          Ứng dụng dành cho cán bộ, nhân viên của đơn vị. Tài khoản có thể phải được quản trị viên duyệt trước khi sử dụng và có thể
          bị khoá khi vi phạm quy định.
        </p>
      </Section>

      <Section title="2. Trách nhiệm của người dùng">
        <List>
          <li>Chỉ ghi âm và tải lên khi người tham dự đã được thông báo, phù hợp quy định của đơn vị và pháp luật.</li>
          <li>Không tải lên nội dung vi phạm pháp luật; hạn chế đưa thông tin định danh người bệnh khi không cần thiết.</li>
          <li>Tự bảo mật tài khoản, không chia sẻ mật khẩu; báo ngay cho quản trị viên khi nghi ngờ bị truy cập trái phép.</li>
          <li>Chỉ chia sẻ bản ghi cho nhóm và người có nhiệm vụ liên quan.</li>
        </List>
      </Section>

      <Section title="3. Kết quả do AI tạo ra">
        <p>
          Bản phiên âm, tên người nói, văn bản tổng hợp và câu trả lời do AI tạo ra có thể có sai sót. Người dùng phải kiểm tra, đối
          chiếu với tệp ghi âm gốc (luôn được giữ nguyên) trước khi dùng cho văn bản chính thức hoặc quyết định chuyên môn.
        </p>
      </Section>

      <Section title="4. Quyền của quản trị viên">
        <p>
          Quản trị viên duyệt, phân quyền hoặc khoá tài khoản; cấu hình nơi lưu trữ (Google Drive) và các kết nối AI của đơn vị.
        </p>
      </Section>

      <Section title="5. Dịch vụ bên thứ ba">
        <p>
          Ứng dụng sử dụng Google Drive, Supabase, Vercel và các nhà cung cấp AI do đơn vị cấu hình. Việc sử dụng các dịch vụ này đồng
          thời chịu điều khoản của từng nhà cung cấp. Cách dữ liệu được xử lý được mô tả trong{" "}
          <Link href="/privacy" className="font-medium text-primary underline-offset-4 hover:underline">
            Chính sách quyền riêng tư
          </Link>
          .
        </p>
      </Section>

      <Section title="6. Giới hạn trách nhiệm">
        <p>
          Ứng dụng được cung cấp theo hiện trạng và có thể tạm gián đoạn để bảo trì hoặc do sự cố của nhà cung cấp hạ tầng. Đơn vị nên
          giữ bản sao các văn bản quan trọng.
        </p>
      </Section>

      <Section title="7. Thay đổi điều khoản">
        <p>Mọi thay đổi được đăng tại trang này, kèm ngày cập nhật. Tiếp tục sử dụng ứng dụng nghĩa là bạn đồng ý với thay đổi.</p>
      </Section>

      <Section title="8. Liên hệ">
        <p>
          Mọi thắc mắc, vui lòng liên hệ <Contact email={org.email} />.
        </p>
      </Section>
    </LegalDoc>
  );
}
