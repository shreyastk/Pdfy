import { describe, it, expect } from "vitest";
import { bodySize, headingLevel, linesToMarkdown, runsToLines, type TextRun } from "./pdf-to-markdown";

const run = (str: string, x: number, y: number, size = 10, width = str.length * size * 0.5): TextRun => ({
  str,
  x,
  y,
  size,
  width,
});

describe("runsToLines", () => {
  it("groups runs by baseline, orders top-down and left-to-right, and inserts spaces at gaps", () => {
    const lines = runsToLines([run("world", 60, 700), run("Second", 10, 686), run("Hello", 10, 700.5)]);
    expect(lines.map((l) => l.text)).toEqual(["Hello world", "Second"]);
  });
});

describe("linesToMarkdown", () => {
  it("detects headings, bullets, numbered items and merges wrapped paragraphs", () => {
    const lines = runsToLines([
      run("Annual Report", 10, 760, 24),
      run("Overview", 10, 720, 15),
      run("This is a para-", 10, 700),
      run("graph that wraps.", 10, 688),
      run("• First point", 10, 660),
      run("2) Second item", 10, 646),
      run("# not a heading", 10, 620),
      // Enough body text so 10pt is clearly the body size.
      run("Body text continues here with more words to weigh the size.", 10, 590),
    ]);
    expect(linesToMarkdown([lines])).toBe(
      [
        "# Annual Report",
        "## Overview",
        "This is a paragraph that wraps.",
        "- First point",
        "2. Second item",
        "\\# not a heading",
        "Body text continues here with more words to weigh the size.",
      ].join("\n\n") + "\n",
    );
  });

  it("does not treat a leading minus sign as a bullet", () => {
    expect(linesToMarkdown([runsToLines([run("-5 degrees outside", 10, 700)])])).toBe("-5 degrees outside\n");
  });
});

describe("size heuristics", () => {
  it("picks the size carrying the most characters as body", () => {
    expect(bodySize([{ text: "x".repeat(100), size: 10, y: 0, x: 0 }, { text: "Title", size: 20, y: 0, x: 0 }])).toBe(10);
  });
  it("maps size ratios to heading levels", () => {
    expect(headingLevel(20, 10)).toBe(1);
    expect(headingLevel(15, 10)).toBe(2);
    expect(headingLevel(12, 10)).toBe(3);
    expect(headingLevel(10.5, 10)).toBe(0);
  });
});
