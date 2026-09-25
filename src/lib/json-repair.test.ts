import { describe, expect, it } from "vitest";
import { parseJsonLoose } from "./json-repair";

describe("parseJsonLoose", () => {
  it("parses valid and fenced JSON", () => {
    expect(parseJsonLoose('{"a":1}').value).toEqual({ a: 1 });
    expect(parseJsonLoose('```json\n{"a":[1,2]}\n```').value).toEqual({ a: [1, 2] });
  });
  it("repairs truncated segment arrays", () => {
    const truncated =
      '{"segments":[{"start":"00:01","end":"00:03","speaker":"S1","text":"Xin chào"},{"start":"00:04","end":"00:09","speaker":"S2","text":"Dạ em xin trình bày ca bệnh {nữ} 64 tu';
    const { value, repaired } = parseJsonLoose<{ segments: unknown[] }>(truncated);
    expect(repaired).toBe(true);
    expect(value.segments).toHaveLength(1);
  });
  it("ignores trailing garbage", () => {
    expect(parseJsonLoose('{"a":"b"} trailing').value).toEqual({ a: "b" });
  });
});
