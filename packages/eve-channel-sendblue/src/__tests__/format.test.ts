import { describe, expect, test } from "bun:test";
import { toPlainText } from "../format.js";

describe("toPlainText", () => {
  test("strips inline formatting", () => {
    expect(toPlainText("**bold**")).toBe("bold");
    expect(toPlainText("*italic*")).toBe("italic");
    expect(toPlainText("***both***")).toBe("both");
    expect(toPlainText("`code`")).toBe("code");
    expect(toPlainText("~~struck~~")).toBe("struck");
  });

  test("strips headings and rules", () => {
    expect(toPlainText("# Title")).toBe("Title");
    expect(toPlainText("### Sub")).toBe("Sub");
  });

  test("turns list markers into bullets", () => {
    expect(toPlainText("- one\n- two")).toBe("• one\n• two");
    expect(toPlainText("* a")).toBe("• a");
  });

  test("renders links as text (url)", () => {
    expect(toPlainText("[eve](https://eve.dev)")).toBe("eve (https://eve.dev)");
  });

  test("preserves bare URLs verbatim", () => {
    const url = "https://sendblue.co/path?x=1&y=2";
    expect(toPlainText(`see ${url}`)).toBe(`see ${url}`);
  });

  test("preserves newlines and plain text", () => {
    expect(toPlainText("line one\n\nline two")).toBe("line one\n\nline two");
    expect(toPlainText("just text")).toBe("just text");
  });
});
