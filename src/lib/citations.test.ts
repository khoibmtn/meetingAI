import { describe, expect, it } from "vitest";
import { linkifyCitations, parseCiteHref } from "./citations";

describe("citations", () => {
  it("linkifies timestamps and source codes", () => {
    expect(linkifyCitations("Theo thầy Hiển [R1 05:23][R2 1:02:03], xem [12:00].")).toBe(
      "Theo thầy Hiển [R1 05:23](#cite-R1-323)[R2 1:02:03](#cite-R2-3723), xem [12:00](#cite--720).",
    );
  });
  it("keeps existing markdown links", () => {
    expect(linkifyCitations("[05:23](https://x.y)")).toBe("[05:23](https://x.y)");
  });
  it("parses hrefs", () => {
    expect(parseCiteHref("#cite-R2-3723")).toEqual({ code: "R2", seconds: 3723 });
    expect(parseCiteHref("#cite--720")).toEqual({ code: null, seconds: 720 });
    expect(parseCiteHref("https://x")).toBeNull();
  });
});
