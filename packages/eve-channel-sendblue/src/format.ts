/**
 * iMessage is a plain-text surface: markdown bold/italic/links/code do not
 * render. Outbound messages are flattened to plain text while preserving
 * newlines and URLs.
 */
export function toPlainText(text: string): string {
  const urlPlaceholders: string[] = [];

  let result = text
    // Protect URLs from markdown stripping.
    .replace(/https?:\/\/[^\s)>\]]+/g, (url) => {
      urlPlaceholders.push(url);
      return `%%URLPH${urlPlaceholders.length - 1}%%`;
    })
    // Fenced code blocks -> inner content only.
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```(\w*\n?)?/g, "").trim())
    // Inline code.
    .replace(/`([^`]+)`/g, "$1")
    // Bold + italic, bold, italic.
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, "$1")
    // Strikethrough.
    .replace(/~~(.+?)~~/g, "$1")
    // Markdown links -> "text (url)".
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    // Headings and horizontal rules.
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*_]{3,}$/gm, "")
    // Unordered list markers -> bullet.
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .trim();

  result = result.replace(/%%URLPH(\d+)%%/g, (_, idx) => urlPlaceholders[Number(idx)] ?? "");

  return result;
}
