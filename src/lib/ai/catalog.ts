/**
 * Danh mục nhà cung cấp AI, vị trí sử dụng AI và tham số mô hình.
 * Dùng được cả ở client (không chứa bí mật).
 */

export type ProviderKind = "gemini" | "openai" | "anthropic" | "deepseek" | "openai_compatible" | "soniox";

export type Usage = "transcription" | "speaker_naming" | "term_correction" | "report" | "chat";

export type Effort = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type Verbosity = "low" | "medium" | "high";

/** Tham số điều chỉnh mô hình (null/undefined = dùng mặc định của nhà cung cấp). */
export interface ModelParams {
  /** Độ "sáng tạo": thấp = ổn định, bám sát; cao = đa dạng. */
  temperature?: number | null;
  topP?: number | null;
  /** Giới hạn độ dài đầu ra (token). */
  maxOutputTokens?: number | null;
  /** Mức suy luận: cao = chính xác hơn nhưng chậm/đắt hơn. */
  effort?: Effort | null;
  /** Độ chi tiết câu trả lời. */
  verbosity?: Verbosity | null;
  /** Tham số nâng cao gửi kèm nguyên văn vào yêu cầu (JSON). */
  extra?: Record<string, unknown> | null;
}

/** Thông tin kết nối an toàn để hiển thị ở client (không có khoá). */
export interface ConnectionSummary {
  id: string;
  scope: "org" | "user";
  name: string;
  provider: ProviderKind;
  baseUrl: string | null;
  keyHint: string | null;
  model: string;
  params: ModelParams;
  status: "untested" | "ok" | "error";
  lastTestedAt: string | null;
  lastLatencyMs: number | null;
  lastError: string | null;
  mine: boolean;
}

export interface ProviderInfo {
  id: ProviderKind;
  label: string;
  kind: "llm" | "asr";
  /** Nhận âm thanh trực tiếp → dùng được cho phiên âm. */
  audioInput: boolean;
  defaultBaseUrl: string;
  keyUrl: string;
  keyPlaceholder: string;
  suggestedModels: string[];
  supports: { temperature: boolean; topP: boolean; effort: boolean; verbosity: boolean };
  note?: string;
}

export const PROVIDERS: Record<ProviderKind, ProviderInfo> = {
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    kind: "llm",
    audioInput: true,
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    keyUrl: "https://aistudio.google.com/apikey",
    keyPlaceholder: "AIza…",
    suggestedModels: ["gemini-3.8-flash", "gemini-3.1-pro-preview", "gemini-3.5-flash-lite"],
    supports: { temperature: true, topP: true, effort: true, verbosity: true },
    note: "Nghe được âm thanh — dùng cho phiên âm. Nên dùng gói trả phí khi xử lý dữ liệu có thông tin người bệnh.",
  },
  soniox: {
    id: "soniox",
    label: "Soniox (phiên âm chuyên dụng)",
    kind: "asr",
    audioInput: true,
    defaultBaseUrl: "https://api.soniox.com",
    keyUrl: "https://console.soniox.com",
    keyPlaceholder: "Soniox API key",
    suggestedModels: ["stt-async-v5"],
    supports: { temperature: false, topP: false, effort: false, verbosity: false },
    note: "Nhận dạng giọng nói chuyên dụng, phân vai bằng đặc trưng giọng, cả tệp dài tới 300 phút.",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic Claude",
    kind: "llm",
    audioInput: false,
    defaultBaseUrl: "https://api.anthropic.com",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-…",
    suggestedModels: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
    supports: { temperature: true, topP: true, effort: true, verbosity: true },
    note: "Mạnh về viết báo cáo, lập luận. Một số mô hình mới không nhận temperature/top-p (sẽ tự bỏ qua).",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    kind: "llm",
    audioInput: false,
    defaultBaseUrl: "https://api.openai.com/v1",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-…",
    suggestedModels: ["gpt-6-sol", "gpt-6-astra", "gpt-6-luna"],
    supports: { temperature: true, topP: true, effort: true, verbosity: true },
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    kind: "llm",
    audioInput: false,
    defaultBaseUrl: "https://api.deepseek.com",
    keyUrl: "https://platform.deepseek.com/api_keys",
    keyPlaceholder: "sk-…",
    suggestedModels: ["deepseek-chat", "deepseek-reasoner"],
    supports: { temperature: true, topP: true, effort: false, verbosity: true },
    note: "API tương thích OpenAI (Chat Completions).",
  },
  openai_compatible: {
    id: "openai_compatible",
    label: "Tương thích OpenAI (tuỳ chỉnh)",
    kind: "llm",
    audioInput: false,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "",
    keyPlaceholder: "API key của dịch vụ",
    suggestedModels: [],
    supports: { temperature: true, topP: true, effort: true, verbosity: true },
    note: "OpenRouter, Groq, Together, Qwen (DashScope), vLLM/Ollama nội bộ… — nhập Base URL của dịch vụ.",
  },
};

export const PROVIDER_ORDER: ProviderKind[] = ["gemini", "soniox", "anthropic", "openai", "deepseek", "openai_compatible"];

export interface UsageInfo {
  id: Usage;
  label: string;
  description: string;
  accepts: ProviderKind[];
}

const LLM: ProviderKind[] = ["gemini", "anthropic", "openai", "deepseek", "openai_compatible"];

export const USAGES: UsageInfo[] = [
  {
    id: "transcription",
    label: "Phiên âm & phân vai",
    description: "Chuyển âm thanh thành văn bản. Cần mô hình nghe được âm thanh (Gemini) hoặc Soniox.",
    accepts: ["gemini", "soniox"],
  },
  {
    id: "speaker_naming",
    label: "Nhận diện tên người nói",
    description: "Suy ra tên, vai trò người nói từ nội dung cuộc họp.",
    accepts: LLM,
  },
  {
    id: "term_correction",
    label: "Hiệu đính thuật ngữ",
    description: "Sửa tên thuốc, thuật ngữ, viết tắt bị nhận dạng sai (chỉ đề xuất, có kiểm chứng).",
    accepts: LLM,
  },
  {
    id: "report",
    label: "Tổng hợp báo cáo",
    description: "Sinh biên bản, báo cáo, bản biên tập theo template.",
    accepts: LLM,
  },
  {
    id: "chat",
    label: "Hỏi đáp AI",
    description: "Hỏi đáp trên nội dung bản ghi/nhóm (kiểu NotebookLM).",
    accepts: LLM,
  },
];

export const EFFORT_OPTIONS: { value: Effort; label: string }[] = [
  { value: "minimal", label: "Tối thiểu — nhanh nhất" },
  { value: "low", label: "Thấp — nhanh" },
  { value: "medium", label: "Vừa — cân bằng" },
  { value: "high", label: "Cao — chính xác hơn" },
  { value: "xhigh", label: "Rất cao" },
  { value: "max", label: "Tối đa — chậm nhất" },
];

export const VERBOSITY_OPTIONS: { value: Verbosity; label: string }[] = [
  { value: "low", label: "Ngắn gọn" },
  { value: "medium", label: "Vừa phải" },
  { value: "high", label: "Chi tiết" },
];

export const PARAM_PRESETS: { id: string; label: string; description: string; params: ModelParams }[] = [
  {
    id: "fast",
    label: "Nhanh",
    description: "Suy luận thấp, trả lời ngắn — tiết kiệm chi phí",
    params: { effort: "low", verbosity: "low", temperature: null },
  },
  {
    id: "balanced",
    label: "Cân bằng",
    description: "Mặc định khuyên dùng",
    params: { effort: "medium", verbosity: "medium", temperature: null },
  },
  {
    id: "accurate",
    label: "Chính xác",
    description: "Suy luận sâu, chi tiết, ít ngẫu nhiên",
    params: { effort: "high", verbosity: "high", temperature: 0.2 },
  },
];

/** Claude 4.7+/Opus 5/Sonnet 5/Fable không nhận temperature/top_p (trả 400) → tự bỏ qua. */
export function claudeAllowsSampling(model: string): boolean {
  return !/^claude-(opus-5|sonnet-5|fable|mythos|opus-4-[78])/.test(model);
}

export function usageAccepts(usage: Usage, provider: ProviderKind): boolean {
  return USAGES.find((u) => u.id === usage)?.accepts.includes(provider) ?? false;
}

export function verbosityInstruction(v?: Verbosity | null): string {
  if (v === "low") return "Trình bày ngắn gọn, súc tích.";
  if (v === "high") return "Trình bày chi tiết, đầy đủ.";
  return "";
}
