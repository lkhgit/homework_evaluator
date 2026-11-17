/** Reflow PDF line wraps without rewriting the source's words or measurements. */
export function activityParagraphs(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").replace(/[\u200b\u00ad]/g, "")
    .split(/\n\s*\n|\n(?=\s*(?:[-*•·]\s+|\d+[.)]\s+))/)
    .map(paragraph => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
