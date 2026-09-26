# Nghiên cứu công nghệ phiên âm và cơ sở thiết kế

*Cập nhật: 25/09/2026. Bối cảnh: phiên âm giao ban, họp, hội nghị bệnh viện; tiếng Việt xen thuật ngữ y khoa tiếng Anh; 3–10 người nói; micro đặt xa.*

**Cách đọc nguồn**

- `[n]` trỏ tới danh sách nguồn ở cuối tài liệu.
- **†**: chỉ đọc được qua trích đoạn của công cụ tìm kiếm vì trang gốc bị chặn khi truy cập. Cần kiểm tra lại trước khi dựa vào.
- **Chưa xác minh**: không tìm thấy bằng chứng công khai.

## 1. Kết luận chính

1. **Chưa có benchmark độc lập tiếng Việt cho các API thương mại.** Mọi WER tiếng Việt dưới đây đều do chính nhà cung cấp công bố. Nên chạy thử trên bản ghi thật của đơn vị (mục 7).
2. **Gemini 3.5 Transcribe là mô hình mới nhất, nhưng có giới hạn cứng.**
   - Khi bật phân vai hoặc mốc thời gian theo từ: tối đa 30 phút và 8 người nói mỗi yêu cầu; từ 3 người nói trở lên được ghi là *experimental*†[3].
   - Có báo cáo lỗi (24/09/2026) mô hình âm thầm bỏ sót hơn 7 phút lời nói [6].
3. **Soniox `stt-async-v5` và ElevenLabs Scribe v2 nhận cả buổi họp 2 giờ trong một yêu cầu.** Cả hai phân vai theo đặc trưng âm học, có từ vựng hoặc ngữ cảnh và có webhook [19][27].
4. **Mô hình mã nguồn mở tiếng Việt yếu trên lời nói y khoa**: khoảng 19–25% WER trên bộ VietMed [56].
5. **Tiền xử lý:** bằng chứng không ủng hộ khử nhiễu mặc định [62][63][64]. Nên chuẩn hoá âm lượng và dùng khoảng lặng hoặc VAD để cắt đoạn và phát hiện khoảng bị bỏ sót [31][6].

## 2. Dịch vụ đám mây

| Dịch vụ | Phân vai | Giới hạn | Từ vựng / ngữ cảnh | WER tiếng Việt (nhà cung cấp) | Giá |
|---|---|---|---|---|---|
| **Gemini 3.x Flash** (phiên âm bằng prompt) | Theo nội dung, qua prompt (không âm học) | Vào 1.048.576 token, ra 65.536 token [10]; Files API 2 GB/tệp, lưu 48 giờ [12] | Qua prompt | Chưa xác minh | 3.8 Flash: $0,75/1M token audio vào, $3,75/1M token ra [5]; giá giới thiệu đến 31/12/2026, sau đó $1,50/$7,50†[13] |
| **Gemini 3.5 Transcribe** | ≤8 người (≥3 là thử nghiệm)†[3] | 30 phút khi bật phân vai hoặc timestamp†[3] | `custom_vocabulary` — có báo cáo không có tác dụng†[7] | Chưa xác minh | $2/1M audio vào, $12/1M ra [5] |
| **Soniox `stt-async-v5`** | Âm học, trên từng token, ≤15 người†[21] | 300 phút/tệp†[24] | `context`: general, text, terms [19][22] | 5,4% (OpenAI 21,4%, Speechmatics 8,9%)†[25] | ~$0,10/giờ†[26] |
| **ElevenLabs Scribe v2** | ≤32 người, có thư viện giọng [27] | 10 giờ, 5 GB/tệp [28] | `keyterms` ≤1.000 cụm (+20% giá) [27] | 3,1% FLEURS; 5,5% Common Voice†[29] | $0,22/giờ†[30] |
| **OpenAI `gpt-4o-transcribe-diarize`** | Có; đặt tên sẵn tối đa 4 người [31] | 25 MB†[32]; ≤1.400 s [33] | Không nhận `prompt`, không có timestamp từ [31] | 21,4% (theo nghiên cứu của Soniox)†[25] | ~$0,006/phút†[34] |
| **AssemblyAI Universal-3.5 Pro** | Có, hỗ trợ tiếng Việt†[35][36] | — | `keyterms_prompt` [37] | Chưa xác minh | $0,21/giờ + $0,02/giờ phân vai†[38] |
| **Deepgram Nova-3** | Có, không phụ thuộc ngôn ngữ†[39] | — | — | Chưa công bố | Chưa xác minh |
| **Google Chirp 3** | **Không** hỗ trợ phân vai vi-VN†[40] | — | — | — | — |
| **Azure Speech** | Batch: mono, <36 người, ≤240 phút [42] | Fast transcription: <2 giờ, <300 MB [42] | Phrase list (vi-VN) [41] | Chưa xác minh | — |
| **FPT.AI, Viettel AI** | Không tìm thấy tài liệu phân vai công khai†[44][45] | Chưa xác minh | — | Chưa xác minh | — |

**Lỗi đã được báo cáo khi dùng Gemini cho audio dài:**

- 2.5 Flash lặp cụm từ hoặc dừng sớm với audio khoảng 1,5 giờ†[14].
- 3 Flash và 3.1 Pro bị lệch mốc thời gian tăng dần theo độ dài bản ghi†[15].
- Một nhóm thực hành thấy lặp và lệch bắt đầu từ khoảng phút 18, nên chọn đoạn ≤15 phút†[16].

**Quyền riêng tư:** ở gói Gemini miễn phí, nội dung có thể được dùng để cải thiện sản phẩm và do người thật đọc. Gói trả phí được loại trừ†[18]. **Chỉ dùng gói trả phí cho âm thanh có thông tin người bệnh.**

## 3. Mã nguồn mở, tự vận hành

| Mô hình | Giấy phép | Kết quả tiếng Việt |
|---|---|---|
| WhisperX [46] | BSD-2 | Bộ căn chỉnh tiếng Việt `wav2vec2-base-vi-vlsp2020`; phân vai bằng pyannote |
| PhoWhisper-large [49] | BSD-3 | CMV-Vi 8,14; VIVOS 4,67; VLSP20-T1 13,75 |
| ChunkFormer-large [50] | Mã nguồn CC-BY-4.0, mô hình CC-BY-NC† | Tối đa 16 giờ audio mỗi lượt; VIVOS 4,18† |
| pyannote.audio [53] | MIT | DER (3.1 / community-1 / precision-2): AMI 22,7 / 19,9 / 15,6; AliMeeting 24,5 / 20,3 / 15,2 |

**WER% trên lời nói chuyên ngành** (bảng đo của repo Gipformer [56]):

| Mô hình | VIVOS | VietMed | MultiMED |
|---|---|---|---|
| PhoWhisper-large | 4,73 | 24,37 | 24,47 |
| ChunkFormer-large | 4,18 | 19,59 | 22,60 |
| Zipformer-30M-6000h | 4,55 | 19,91 | 19,88 |
| Qwen3-ASR-1.7B | 7,17 | 20,21 | 20,11 |
| Gipformer1.5 | 4,25 | 19,23 | 19,17 |

Mô hình mã nguồn mở cần máy chủ GPU. Vercel cũng không chạy được các mô hình này, nên ứng dụng dùng dịch vụ đám mây.

## 4. Tiền xử lý âm thanh

- **Khử nhiễu có thể làm tăng lỗi nhận dạng.**
  - Chạy SAM-Audio trước Whisper làm WER tăng ở mọi cấu hình thử nghiệm (10,53% lên 21,66%)†[62].
  - Deepgram ghi nhận độ chính xác giảm sau khi lọc nhiễu, nhất là trong lĩnh vực y tế†[63].
  - Nghiên cứu Interspeech 2024 cho kết quả thay đổi tuỳ bộ dữ liệu [64].
- **Chuẩn hoá âm lượng:** bộ chia đoạn của OpenAI chuẩn hoá âm lượng trước khi chạy VAD [31]. `loudnorm` theo EBU R128. `dynaudnorm` nâng các đoạn nhỏ tiếng, hợp với người nói xa micro [65].
- **Đo thực tế trên bản ghi giao ban mẫu (40 phút, m4a):**
  - `loudnorm` một lượt tốn khoảng 12,5 s CPU cho mỗi đoạn 10 phút. Khuếch đại tuyến tính kèm `alimiter` chỉ tốn 0,45 s.
  - FLAC mặc định ghi mẫu 32-bit sau bộ lọc (20,9 MB mỗi 10 phút). Ép 16-bit còn khoảng 11 MB.
  - Ngưỡng lặng tính theo âm lượng trung bình (−41 dB) **không tìm thấy khoảng lặng nào** vì nền ồn hội trường khoảng −40 dB. Ngưỡng theo nền ồn và mức lời nói (−35,9 dB) tìm được 363 khoảng lặng (18%).
- **Định dạng:** Gemini tự hạ mẫu xuống khoảng 16 kbps mono†[11]. FLAC 16 kHz mono không mất dữ liệu và gọn hơn WAV.
- **Chia đoạn:** với Gemini nên dùng đoạn 10–15 phút, cắt ở khoảng lặng, rồi **dò khoảng hở** (vùng có tiếng nói mà không có chữ) để phiên âm lại [16][6].

## 5. Hạ tầng triển khai

| Nội dung | Thông tin |
|---|---|
| Vercel: thời gian chạy hàm (Fluid compute) | Mặc định 300 s. Tối đa 300 s (Hobby), 800 s (Pro) [69] |
| Vercel: kích thước request/response | 4,5 MB; response dạng stream được miễn [70] |
| Vercel: bộ nhớ, `/tmp` | Hobby: 2 GB / 1 vCPU [71]. `/tmp`: 500 MB [70] |
| Vercel: `after()` | Chạy trong giới hạn `maxDuration` của route [72] |
| Vercel Cron | Hobby: 1 lần/ngày. Pro: đúng phút đã hẹn [73] |
| Drive: upload | Mỗi khúc là bội số của 256 KiB. Phiên upload sống 1 tuần; hỏi trạng thái bằng `Content-Range: bytes */TOTAL` [74] |
| Drive: tài khoản | Service account không có quota lưu trữ, nên phải dùng OAuth của người thật [75]. Ứng dụng OAuth để ở trạng thái *Testing* có refresh token hết hạn sau 7 ngày [76] |
| Drive: phát lại | `files.get?alt=media` hỗ trợ `Range` [77]. Phạm vi `drive.file` chỉ truy cập tệp do ứng dụng tạo [78] |
| Supabase | Khoá mới `sb_publishable_` / `sb_secret_` thay anon/service_role [79]. `postgres_changes` tuân thủ RLS nhưng khó mở rộng khi có hàng nghìn người nghe [80] |

## 6. Quyết định thiết kế trong MeetingAI

| Khuyến nghị từ nghiên cứu | Cách triển khai |
|---|---|
| Giữ nguyên tệp gốc | Tệp gốc lưu nguyên vẹn trên Drive, không nén lại. Transcript máy (`original_segments`) không bao giờ bị sửa; bản hiệu đính lưu riêng và có nút khôi phục |
| Phân vai nhất quán cho cả buổi | Có engine **Soniox** (phân vai âm học toàn tệp, ngữ cảnh gồm tên người dự và thuật ngữ). Engine Gemini dùng danh sách người nói lập từ đoạn đầu, truyền cho các đoạn sau, rồi thống nhất theo tên |
| Gemini: đoạn ≤15 phút, cắt ở khoảng lặng | Mặc định 10 phút; cắt ở giữa khoảng lặng dài nhất trong vùng ±90 s. Không có khoảng lặng thì chồng lấn 8 s rồi khử trùng |
| Phát hiện nội dung bị bỏ sót [6] | So vùng có tiếng nói với vùng đã có chữ, phiên âm bổ sung khoảng hở (cờ `gap_fill`) và hiển thị **độ phủ** |
| Không khử nhiễu mặc định; chuẩn hoá âm lượng | Mặc định cân bằng tuyến tính (một mức khuếch đại cho cả bản ghi, chặn đỉnh). `dynaudnorm` cho micro xa và khử nhiễu `afftdn` chỉ là tuỳ chọn |
| Dùng VAD hoặc khoảng lặng để cắt đoạn | VAD năng lượng theo khung 100 ms, ngưỡng thích nghi theo nền ồn của từng bản ghi (mục 4) |
| LLM hậu kiểm chỉ trả JSON, mã kiểm chứng (DiarizationLM [68]) | Nhận diện tên: chỉ áp dụng độ tin cậy cao hoặc vừa. Hiệu đính thuật ngữ: kiểm tra khoảng cách chỉnh sửa và khớp từ điển. LLM không viết lại transcript |
| Phân vai xa micro vẫn sai khoảng 15–20% DER [53] | Giao diện đổi tên, gộp và gán lại người nói cho từng câu |
| Từ vựng chuyên ngành | Từ điển khoảng 100 thuật ngữ GMHS và y khoa có sẵn, cộng từ điển của đơn vị, nhóm và cá nhân, đưa vào prompt hoặc ngữ cảnh Soniox |

**Engine mặc định:** ứng dụng mặc định dùng **Gemini** vì một khoá dùng được cho cả phiên âm, tổng hợp và hỏi đáp, chi phí thấp. Nghiên cứu lại **khuyến nghị Soniox làm engine phiên âm chính** nhờ phân vai âm học toàn tệp. Nên chạy thử cả hai (mục 7), rồi chọn trong *Quản trị → Kết nối AI → Phân công mô hình*.

**Chưa tích hợp:**

- ElevenLabs Scribe v2 và AssemblyAI: có thể bổ sung thành engine mới theo cùng giao diện `soniox.ts`.
- Gemini 3.5 Transcribe: chờ xác nhận hỗ trợ tiếng Việt và bản sửa lỗi bỏ sót.

## 7. Đánh giá chất lượng đề xuất (bake-off)

1. Chọn 3–5 bản ghi thật: giao ban, họp, hội nghị; có micro xa và nhiều người nói.
2. Phiên âm bằng Gemini (10 phút/đoạn) và Soniox. Dùng transcript NotebookLM của cùng tệp làm mốc so sánh.
3. Chấm 4 chỉ số:
   - WER theo âm tiết trên các đoạn mẫu.
   - Tỷ lệ bắt đúng thuật ngữ y khoa: tên thuốc, thủ thuật, viết tắt.
   - Lỗi gán người nói.
   - Tỷ lệ bỏ sót, xem ở chỉ số *độ phủ* trong tab Thông tin của bản ghi.

## 8. Chi phí ước tính cho mỗi giờ âm thanh

| Cấu hình | Phiên âm | Hậu kiểm và tổng hợp (3.8 Flash) | Tổng |
|---|---|---|---|
| Soniox v5 + LLM | ~$0,10–0,11†[26] | ~$0,10 [5] | ~$0,20–0,31 |
| Gemini 3.8 Flash (chia đoạn) + LLM | ~$0,09 audio + ~$0,06–0,09 chữ đầu ra (tự tính từ [5]: 32 token/s†[11]) | ~$0,10 | ~$0,25–0,30 |
| ElevenLabs Scribe v2 (keyterms) + LLM | $0,264 [30][27] | ~$0,10 | ~$0,36–0,46 |

Giá giới thiệu của 3.8 Flash tăng gấp đôi từ 01/01/2027†[13]. Nếu dùng Claude hoặc GPT cho văn bản tổng hợp, chi phí tuỳ độ dài transcript và mô hình được chọn.

## Nguồn

[1] https://github.com/google-gemini/cookbook/blob/main/quickstarts/Get_started_transcribe.ipynb
[3] https://ai.google.dev/gemini-api/docs/transcribe †
[5] https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json (bảng của bên thứ ba, phản ánh giá chính thức)
[6] https://github.com/machinewrapped/llm-subtrans/issues/458
[7] https://discuss.ai.google.dev/t/gemini-3-5-transcribe-custom-vocabulary-appears-to-have-no-effect/179892 †
[10] https://github.com/google-gemini/cookbook/blob/main/quickstarts/Counting_Tokens.ipynb
[11] https://ai.google.dev/gemini-api/docs/audio †
[12] https://github.com/google-gemini/cookbook/blob/main/quickstarts/File_API.ipynb
[13] https://blog.google/innovation-and-ai/models-and-research/gemini-models/3-8-flash-and-3-8-flash-cyber/ †
[14] https://discuss.ai.google.dev/t/inconsistent-transcriptions-with-gemini-2-5-flash/105328 †
[15] https://discuss.ai.google.dev/t/bug-gemini-3-flash-and-3-1-pro-progressive-timestamp-drift-in-audio-transcription/129501 †
[16] https://towardsdatascience.com/building-a-scalable-and-accurate-audio-interview-transcription-pipeline-with-google-gemini/ †
[18] https://ai.google.dev/gemini-api/terms †
[19] https://github.com/soniox/soniox_examples/blob/master/speech_to_text/python_sdk/soniox_sdk_async.py
[21] https://soniox.com/docs/stt/concepts/speaker-diarization †
[22] https://soniox.com/docs/stt/concepts/context †
[24] https://soniox.com/docs/stt/async/limits-and-quotas †
[25] https://soniox.com/compare/soniox-vs-openai/vietnamese ; https://soniox.com/compare/soniox-vs-speechmatics/vietnamese †
[26] https://soniox.com/pricing †
[27] https://github.com/elevenlabs/elevenlabs-python/blob/main/src/elevenlabs/speech_to_text/raw_client.py
[28] https://github.com/elevenlabs/skills/blob/main/speech-to-text/SKILL.md
[29] https://elevenlabs.io/speech-to-text/vietnamese †
[30] https://elevenlabs.io/pricing/api †
[31] https://github.com/openai/openai-python/blob/main/src/openai/types/audio/transcription_create_params.py
[32] https://developers.openai.com/api/docs/guides/speech-to-text †
[33] https://github.com/GAIK-project/gaik-toolkit/pull/12
[34] https://developers.openai.com/api/docs/pricing †
[35] https://www.assemblyai.com/blog/universal-3-5-pro-async †
[36] https://www.assemblyai.com/blog/assemblyai-newsletter-37 †
[37] https://github.com/AssemblyAI/assemblyai-python-sdk/blob/master/assemblyai/types.py
[38] https://www.assemblyai.com/pricing †
[39] https://deepgram.com/learn/deepgram-nova-3-expands-speech-to-text-support-across-asia-pacific †
[40] https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3 †
[41] https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/includes/language-support/stt.md
[42] https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/batch-transcription-create.md
[44] https://docs.fpt.ai/docs/en/speech/api/speech-to-text/ †
[45] https://viettelai.vn/en/speech-to-text †
[46] https://github.com/m-bain/whisperX
[49] https://github.com/VinAIResearch/PhoWhisper
[50] https://github.com/khanld/chunkformer
[53] https://github.com/pyannote/pyannote-audio
[56] https://github.com/ggroup-ai-lab/gipformer
[62] https://arxiv.org/abs/2603.04710 †
[63] https://deepgram.com/learn/the-noise-reduction-paradox-why-it-may-hurt-speech-to-text-accuracy †
[64] https://github.com/candyolivia/is2024_deep_enhancement
[65] https://github.com/FFmpeg/FFmpeg/blob/master/doc/filters.texi
[68] https://github.com/google/speaker-id/tree/master/DiarizationLM
[69] https://vercel.com/docs/functions/configuring-functions/duration †
[70] https://vercel.com/docs/functions/limitations †
[71] https://vercel.com/docs/functions/configuring-functions/memory †
[72] https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/04-functions/after.mdx
[73] https://vercel.com/docs/cron-jobs/usage-and-pricing †
[74] https://developers.google.com/workspace/drive/api/guides/manage-uploads †
[75] https://developers.google.com/workspace/drive/api/guides/handle-errors †
[76] https://developers.google.com/identity/protocols/oauth2 †
[77] https://developers.google.com/workspace/drive/api/guides/manage-downloads †
[78] https://developers.google.com/workspace/drive/api/guides/api-specific-auth †
[79] https://github.com/orgs/supabase/discussions/29260
[80] https://supabase.com/docs/guides/realtime/postgres-changes †
