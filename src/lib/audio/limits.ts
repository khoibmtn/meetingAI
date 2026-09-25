/**
 * Giới hạn dùng chung cho trình duyệt và máy chủ.
 * Worker chép cả tệp gốc vào /tmp (Vercel cho ~500 MB) khi tệp không nằm trên Google Drive,
 * nên tệp giữ tạm để phiên âm (không lưu) tối đa 200 MB.
 */
export const TEMP_AUDIO_MAX_BYTES = 200 * 1024 * 1024;

/** Tệp tạm chưa được phiên âm sẽ tự xoá sau số ngày này. */
export const TEMP_AUDIO_TTL_DAYS = 7;
