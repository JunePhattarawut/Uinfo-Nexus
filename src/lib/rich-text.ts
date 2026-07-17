type RichNode = {
  [key: string]: unknown;
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ [key: string]: unknown; type?: string; attrs?: Record<string, unknown> }>;
  content?: RichNode[];
};

function applyInlineMarks(text: string): RichNode[] {
  const nodes: RichNode[] = [];
  // image must come before link so ![...](...) isn't captured as a link
  const pattern = /(!\[([^\]]*)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(_([^_]+)_)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push({ type: "text", text: text.slice(last, match.index) });
    if (match[1])       nodes.push({ type: "image", attrs: { alt: match[2], src: match[3] } });
    else if (match[5])  nodes.push({ type: "text", text: match[5], marks: [{ type: "strong" }] });
    else if (match[7])  nodes.push({ type: "text", text: match[7], marks: [{ type: "em" }] });
    else if (match[9])  nodes.push({ type: "text", text: match[9], marks: [{ type: "code" }] });
    else if (match[11]) nodes.push({ type: "text", text: match[11], marks: [{ type: "link", attrs: { href: match[12] } }] });
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push({ type: "text", text: text.slice(last) });
  return nodes.length ? nodes : [{ type: "text", text }];
}

function paragraph(text: string): RichNode {
  return { type: "paragraph", content: text ? applyInlineMarks(text) : [] };
}

function listItem(text: string): RichNode {
  return { type: "listItem", content: [paragraph(text)] };
}

function tableCell(text: string, header = false): RichNode {
  return { type: header ? "tableHeader" : "tableCell", content: [paragraph(text.trim())] };
}

function parseTable(lines: string[], start: number) {
  const rows: RichNode[] = [];
  let index = start;
  while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
    const rawCells = lines[index].trim().slice(1, -1).split("|");
    const isSeparator = rawCells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell));
    if (!isSeparator) {
      rows.push({
        type: "tableRow",
        content: rawCells.map((cell) =>
          tableCell(cell, rows.length === 0 && index + 1 < lines.length && /^\s*\|\s*:?-{3,}:?/.test(lines[index + 1] ?? ""))
        ),
      });
    }
    index += 1;
  }
  return { node: { type: "table", content: rows } as RichNode, next: index };
}

function parseBlocks(lines: string[]): RichNode[] {
  const content: RichNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    // Fenced callout  :::variant … :::
    const calloutOpen = /^:::(info|warning|error|success)\s*$/i.exec(line.trim());
    if (calloutOpen) {
      const variant = calloutOpen[1].toLowerCase();
      const inner: string[] = [];
      i += 1;
      while (i < lines.length && !/^:::\s*$/.test(lines[i].trim())) { inner.push(lines[i]); i += 1; }
      if (i < lines.length) i += 1; // skip closing :::
      content.push({ type: "callout", attrs: { variant }, content: parseBlocks(inner) });
      continue;
    }

    // Fenced code block
    if (/^```/.test(line.trim())) {
      const body: string[] = [];
      const lang = line.trim().slice(3).trim() || null;
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { body.push(lines[i]); i += 1; }
      if (i < lines.length) i += 1;
      content.push({ type: "codeBlock", attrs: lang ? { language: lang } : {}, content: [{ type: "text", text: body.join("\n") }] });
      continue;
    }

    // Table
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const parsed = parseTable(lines, i);
      content.push(parsed.node);
      i = parsed.next;
      continue;
    }

    // Standalone image  ![alt](url)
    const imgLine = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line.trim());
    if (imgLine) {
      content.push({ type: "image", attrs: { alt: imgLine[1], src: imgLine[2] } });
      i += 1;
      continue;
    }

    // Headings
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      content.push({ type: "heading", attrs: { level: heading[1].length }, content: applyInlineMarks(heading[2]) });
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) { content.push({ type: "horizontalRule" }); i += 1; continue; }

    // Blockquote
    if (/^>\s+/.test(line)) {
      const quotes: RichNode[] = [];
      while (i < lines.length && /^>\s+/.test(lines[i])) { quotes.push(paragraph(lines[i].replace(/^>\s+/, ""))); i += 1; }
      content.push({ type: "blockquote", content: quotes });
      continue;
    }

    // Bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: RichNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(listItem(lines[i].replace(/^\s*[-*]\s+/, ""))); i += 1; }
      content.push({ type: "bulletList", content: items });
      continue;
    }

    // Numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: RichNode[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(listItem(lines[i].replace(/^\s*\d+\.\s+/, ""))); i += 1; }
      content.push({ type: "orderedList", content: items });
      continue;
    }

    // Paragraph (collect until next block marker)
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^```/.test(lines[i].trim()) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^>\s+/.test(lines[i]) &&
      !/^\s*\|.*\|\s*$/.test(lines[i]) &&
      !/^:::(info|warning|error|success)\s*$/i.test(lines[i].trim()) &&
      !/^!\[/.test(lines[i].trim())
    ) {
      para.push(lines[i]);
      i += 1;
    }
    content.push(paragraph(para.join("\n")));
  }
  return content;
}

export function richDocFromMarkdown(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const content = parseBlocks(lines);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}
