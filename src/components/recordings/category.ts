export const CATEGORIES = [
  { value: "giao_ban", label: "Giao ban chuyên môn" },
  { value: "hop", label: "Cuộc họp" },
  { value: "hoi_nghi", label: "Hội nghị / Hội thảo" },
  { value: "dao_tao", label: "Sinh hoạt khoa học / Đào tạo" },
  { value: "khac", label: "Khác" },
] as const;

export function categoryLabel(v: string) {
  return CATEGORIES.find((c) => c.value === v)?.label ?? v;
}
