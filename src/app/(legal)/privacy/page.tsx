import type { Metadata } from "next";
import Link from "next/link";
import { getLegalOrg } from "../org";
import { Contact, ExternalLink, LegalDoc, List, Section } from "../prose";

export const metadata: Metadata = { title: "Chính sách quyền riêng tư" };
export const revalidate = 300;

export default async function PrivacyPage() {
  const org = await getLegalOrg();
  return (
    <LegalDoc title="Chính sách quyền riêng tư">
      <p>
        MeetingAI là ứng dụng phiên âm và tổng hợp nội dung giao ban, cuộc họp, hội nghị, sử dụng nội bộ{" "}
        {org.name ? <b>tại {org.name}</b> : "tại đơn vị triển khai"} (“đơn vị”). Chính sách này mô tả dữ liệu ứng dụng thu thập, cách
        sử dụng, lưu trữ, chia sẻ và bảo vệ dữ liệu, bao gồm dữ liệu nhận được qua các API của Google.
      </p>

      <Section title="1. Dữ liệu được thu thập">
        <List>
          <li>
            <b>Thông tin tài khoản:</b> họ tên, địa chỉ email, ảnh đại diện (khi đăng nhập bằng Google); chức danh, khoa/phòng do
            người dùng tự khai.
          </li>
          <li>
            <b>Nội dung do người dùng tạo:</b> tệp ghi âm và thông tin cuộc họp (tiêu đề, ngày, địa điểm, thành phần), bản phiên âm,
            văn bản tổng hợp, ghi chú, tin nhắn, câu hỏi và câu trả lời AI.
          </li>
          <li>
            <b>Khoá API của nhà cung cấp AI</b> do quản trị viên hoặc người dùng nhập — được mã hoá (AES-256-GCM) trước khi lưu.
          </li>
          <li>
            <b>Thông tin kỹ thuật tối thiểu</b> (thời điểm, trạng thái xử lý) phục vụ vận hành và khắc phục lỗi.
          </li>
        </List>
      </Section>

      <Section title="2. Dữ liệu người dùng Google">
        <List>
          <li>
            <b>Đăng nhập bằng Google</b> (tuỳ chọn): ứng dụng chỉ nhận họ tên, địa chỉ email và ảnh đại diện (phạm vi{" "}
            <code>openid</code>, <code>email</code>, <code>profile</code>) để tạo và nhận diện tài khoản.
          </li>
          <li>
            <b>Google Drive</b> (phạm vi <code>drive.file</code>): quản trị viên kết nối một tài khoản Google Drive của đơn vị làm
            nơi lưu tệp ghi âm gốc. Với phạm vi này, ứng dụng <b>chỉ truy cập được thư mục và tệp do chính ứng dụng tạo ra</b>,
            không xem, sửa hay xoá bất kỳ tệp nào khác trong Drive. Quyền này được dùng để: tạo thư mục lưu trữ; tải tệp ghi âm lên;
            phát lại và đọc tệp để phiên âm; chuyển tệp vào thùng rác khi bản ghi bị xoá. Địa chỉ email của tài khoản Drive chỉ
            hiển thị cho quản trị viên để biết tài khoản đang được kết nối.
          </li>
          <li>
            Tệp ghi âm đọc từ Drive chỉ được gửi tới nhà cung cấp phiên âm mà đơn vị đã cấu hình, nhằm thực hiện chức năng phiên âm
            do người dùng yêu cầu.
          </li>
          <li>
            Ứng dụng <b>không</b> dùng dữ liệu người dùng Google cho quảng cáo, <b>không</b> bán dữ liệu, và <b>không</b> dùng dữ
            liệu này để phát triển, cải thiện hay huấn luyện các mô hình AI/ML tổng quát. Không ai đọc dữ liệu này, trừ khi người
            dùng cho phép, khi cần để bảo đảm an ninh, hoặc theo yêu cầu của pháp luật.
          </li>
          <li>
            Việc MeetingAI sử dụng và chuyển giao sang ứng dụng khác các thông tin nhận được từ Google API tuân thủ{" "}
            <ExternalLink href="https://developers.google.com/terms/api-services-user-data-policy">
              Chính sách dữ liệu người dùng của Google API Services
            </ExternalLink>
            , bao gồm các yêu cầu Sử dụng giới hạn (Limited Use).
          </li>
        </List>
      </Section>

      <Section title="3. Mục đích sử dụng">
        <p>
          Dữ liệu chỉ được dùng để cung cấp các chức năng của ứng dụng: phiên âm, nhận diện người nói, soạn văn bản tổng hợp, hỏi đáp
          AI trên nội dung cuộc họp, chia sẻ theo nhóm, nhắn tin; quản lý tài khoản; bảo đảm an toàn và khắc phục sự cố.
        </p>
      </Section>

      <Section title="4. Chia sẻ dữ liệu">
        <List>
          <li>
            <b>Hạ tầng:</b> Vercel (máy chủ chạy ứng dụng), Supabase (cơ sở dữ liệu, xác thực), Google Drive (lưu tệp ghi âm gốc).
          </li>
          <li>
            <b>Nhà cung cấp AI do đơn vị cấu hình</b> (ví dụ Google Gemini, Soniox, OpenAI, Anthropic, DeepSeek): nhận âm thanh hoặc
            văn bản chỉ để thực hiện yêu cầu (phiên âm, tổng hợp, hỏi đáp). Tệp âm thanh tạm tải lên nhà cung cấp phiên âm được xoá
            sau khi phiên âm xong. Dữ liệu gửi tới nhà cung cấp AI chịu điều khoản của nhà cung cấp đó; một số gói miễn phí cho phép
            nhà cung cấp dùng dữ liệu để cải thiện dịch vụ, vì vậy đơn vị nên dùng gói trả phí khi xử lý thông tin nhạy cảm (ví dụ
            thông tin người bệnh).
          </li>
          <li>Trong ứng dụng, bản ghi chỉ hiển thị với người tạo và các nhóm được chia sẻ.</li>
          <li>Ứng dụng không bán, không cho thuê dữ liệu; chỉ cung cấp cho cơ quan nhà nước có thẩm quyền khi pháp luật yêu cầu.</li>
        </List>
      </Section>

      <Section title="5. Lưu trữ và bảo mật">
        <List>
          <li>Mọi kết nối được mã hoá (HTTPS).</li>
          <li>
            Phân quyền theo từng dòng dữ liệu (Row Level Security): mỗi người chỉ truy cập được dữ liệu của mình và của nhóm được
            chia sẻ.
          </li>
          <li>Khoá API và token truy cập Google Drive được mã hoá trước khi lưu.</li>
          <li>Đơn vị có thể yêu cầu quản trị viên duyệt mọi tài khoản mới trước khi sử dụng.</li>
          <li>
            Dữ liệu được lưu cho đến khi người dùng hoặc quản trị viên xoá. Khi xoá một bản ghi, bản phiên âm và văn bản tổng hợp
            của bản ghi đó bị xoá khỏi cơ sở dữ liệu; tệp ghi âm trên Drive được chuyển vào thùng rác và Google tự xoá vĩnh viễn sau
            30 ngày.
          </li>
        </List>
      </Section>

      <Section title="6. Quyền của người dùng">
        <List>
          <li>Xem, chỉnh sửa, xuất (DOCX, TXT, SRT…) và xoá các bản ghi của mình.</li>
          <li>
            Yêu cầu xoá tài khoản và dữ liệu cá nhân: liên hệ <Contact email={org.email} />.
          </li>
          <li>
            Thu hồi quyền truy cập Google của ứng dụng bất cứ lúc nào tại{" "}
            <ExternalLink href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</ExternalLink>.
          </li>
        </List>
      </Section>

      <Section title="7. Thay đổi chính sách">
        <p>Mọi thay đổi được đăng tại trang này, kèm ngày cập nhật.</p>
      </Section>

      <Section title="8. Liên hệ">
        <p>
          Mọi câu hỏi về quyền riêng tư, vui lòng liên hệ <Contact email={org.email} />. Xem thêm{" "}
          <Link href="/terms" className="font-medium text-primary underline-offset-4 hover:underline">
            Điều khoản sử dụng
          </Link>
          .
        </p>
      </Section>
    </LegalDoc>
  );
}
