import type { ReactNode } from "react";

type RichNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: RichNode[];
};

function applyInlineMarks(text: string): RichNode[] {
  const nodes: RichNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*)|(_([^_]+)_)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push({ type: "text", text: text.slice(last, match.index) });
    if (match[2]) nodes.push({ type: "text", text: match[2], marks: [{ type: "strong" }] });
    else if (match[4]) nodes.push({ type: "text", text: match[4], marks: [{ type: "em" }] });
    else if (match[6]) nodes.push({ type: "text", text: match[6], marks: [{ type: "code" }] });
    else if (match[8]) nodes.push({ type: "text", text: match[8], marks: [{ type: "link", attrs: { href: match[9] } }] });
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
        content: rawCells.map((cell) => tableCell(cell, rows.length === 0 && index + 1 < lines.length && /^\s*\|\s*:?-{3,}:?/.test(lines[index + 1] ?? ""))),
      });
    }
    index += 1;
  }
  return { node: { type: "table", content: rows } as RichNode, next: index };
}

export function richDocFromMarkdown(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const content: RichNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    if (/^```/.test(line.trim())) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { body.push(lines[i]); i += 1; }
      if (i < lines.length) i += 1;
      content.push({ type: "codeBlock", content: [{ type: "text", text: body.join("\n") }] });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const parsed = parseTable(lines, i);
      content.push(parsed.node);
      i = parsed.next;
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      content.push({ type: "heading", attrs: { level: heading[1].length }, content: applyInlineMarks(heading[2]) });
      i += 1;
      continue;
    }
    if (/^---+$/.test(line.trim())) { content.push({ type: "horizontalRule" }); i += 1; continue; }
    if (/^>\s+/.test(line)) {
      const quotes: RichNode[] = [];
      while (i < lines.length && /^>\s+/.test(lines[i])) { quotes.push(paragraph(lines[i].replace(/^>\s+/, ""))); i += 1; }
      content.push({ type: "blockquote", content: quotes });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: RichNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(listItem(lines[i].replace(/^\s*[-*]\s+/, ""))); i += 1; }
      content.push({ type: "bulletList", content: items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: RichNode[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(listItem(lines[i].replace(/^\s*\d+\.\s+/, ""))); i += 1; }
      content.push({ type: "orderedList", content: items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s+/.test(lines[i]) && !/^```/.test(lines[i].trim()) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) && !/^>\s+/.test(lines[i]) && !/^\s*\|.*\|\s*$/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    content.push(paragraph(para.join("\n")));
  }
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

function textContent(nodes: RichNode[] = []): string {
  return nodes.map((node) => node.text ?? textContent(node.content)).join("");
}

function renderInline(nodes: RichNode[] = []): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === "hardBreak") return <br key={index} />;
    let child: ReactNode = node.text ?? renderInline(node.content);
    for (const mark of node.marks ?? []) {
      if (mark.type === "strong") child = <strong key={`${index}-strong`} className="font-semibold">{child}</strong>;
      if (mark.type === "em") child = <em key={`${index}-em`}>{child}</em>;
      if (mark.type === "code") child = <code key={`${index}-code`} className="rounded bg-gray-100 px-1 py-0.5 text-[0.9em]">{child}</code>;
      if (mark.type === "link") child = <a key={`${index}-link`} href={String(mark.attrs?.href ?? "#")} className="text-blue-600 underline">{child}</a>;
    }
    return <span key={index}>{child}</span>;
  });
}

function renderBlocks(nodes: RichNode[] = []): ReactNode[] {
  return nodes.map((node, index) => renderBlock(node, index));
}

function renderCell(node: RichNode, index: number) {
  const isHeader = node.type === "tableHeader";
  const Tag = isHeader ? "th" : "td";
  const colwidth = Array.isArray(node.attrs?.colwidth) ? Number(node.attrs?.colwidth[0]) : undefined;
  const text = textContent(node.content).trim();
  const isPass = /^(ผ่าน|pass|complied)$/i.test(text);
  const isFail = /^(ไม่ผ่าน|fail|not complied)$/i.test(text);
  return (
    <Tag key={index} style={colwidth ? { width: colwidth } : undefined} className={["border border-gray-300 px-4 py-3 align-top text-left text-sm leading-7", isHeader ? "bg-gray-100 text-center text-sm font-bold text-gray-900" : "bg-white text-gray-800"].join(" ")}>
      {isPass || isFail ? <span className={isPass ? "inline-flex rounded bg-lime-200 px-2 py-0.5 text-xs font-bold text-lime-900" : "inline-flex rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800"}>{text}</span> : renderBlocks(node.content)}
    </Tag>
  );
}

function renderBlock(node: RichNode, index: number): ReactNode {
  switch (node.type) {
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 2), 1), 4);
      const className = level === 1 ? "text-2xl font-bold" : level === 2 ? "text-xl font-bold" : "text-lg font-semibold";
      const children = renderInline(node.content);
      if (level === 1) return <h1 key={index} className={`${className} mt-4 mb-2 text-gray-900`}>{children}</h1>;
      if (level === 2) return <h2 key={index} className={`${className} mt-4 mb-2 text-gray-900`}>{children}</h2>;
      if (level === 3) return <h3 key={index} className={`${className} mt-4 mb-2 text-gray-900`}>{children}</h3>;
      return <h4 key={index} className={`${className} mt-4 mb-2 text-gray-900`}>{children}</h4>;
    }
    case "paragraph": return <p key={index} className="my-2 whitespace-pre-wrap text-sm leading-7 text-gray-800">{renderInline(node.content)}</p>;
    case "panel": return <div key={index} className="my-4 flex gap-3 rounded bg-blue-50 px-4 py-3 text-blue-950"><span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">i</span><div className="min-w-0 font-semibold">{renderBlocks(node.content)}</div></div>;
    case "bulletList": return <ul key={index} className="my-3 list-disc pl-6 text-sm leading-7">{renderBlocks(node.content)}</ul>;
    case "orderedList": return <ol key={index} className="my-3 list-decimal pl-6 text-sm leading-7">{renderBlocks(node.content)}</ol>;
    case "listItem": return <li key={index}>{renderBlocks(node.content)}</li>;
    case "codeBlock": return <pre key={index} className="my-3 overflow-auto rounded bg-gray-950 p-3 text-xs text-gray-100"><code>{textContent(node.content)}</code></pre>;
    case "blockquote": return <blockquote key={index} className="my-3 border-l-4 border-gray-300 pl-4 text-gray-700">{renderBlocks(node.content)}</blockquote>;
    case "table": return <div key={index} className="my-6 overflow-x-auto"><table className="w-full min-w-[760px] table-fixed border-collapse rounded-lg border border-gray-300 bg-white"><tbody>{renderBlocks(node.content)}</tbody></table></div>;
    case "tableRow": return <tr key={index}>{(node.content ?? []).map(renderCell)}</tr>;
    case "horizontalRule": return <hr key={index} className="my-6 border-gray-200" />;
    default: return <div key={index}>{renderBlocks(node.content)}</div>;
  }
}

export function RichTextRenderer({ doc, empty = "No description" }: { doc: unknown; empty?: string }) {
  if (!doc || typeof doc !== "object") return <p className="text-sm text-gray-500">{empty}</p>;
  const root = doc as RichNode;
  if (!Array.isArray(root.content) || root.content.length === 0) return <p className="text-sm text-gray-500">{empty}</p>;
  return <div className="jira-rich-text">{renderBlocks(root.content)}</div>;
}
