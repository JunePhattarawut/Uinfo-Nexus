import type { ReactNode } from "react";

type RichNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: RichNode[];
};

function renderInline(nodes: RichNode[] = []): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === "hardBreak") return <br key={index} />;
    // Inline image node (from applyInlineMarks when image appears mid-paragraph)
    if (node.type === "image") {
      return (
        <img
          key={index}
          src={String(node.attrs?.src ?? "")}
          alt={String(node.attrs?.alt ?? "")}
          className="inline-block max-w-full rounded"
        />
      );
    }
    let child: ReactNode = node.text ?? renderInline(node.content);
    for (const mark of node.marks ?? []) {
      if (mark.type === "strong") child = <strong key={`${index}-s`} className="font-semibold">{child}</strong>;
      if (mark.type === "em") child = <em key={`${index}-e`}>{child}</em>;
      if (mark.type === "code") child = <code key={`${index}-c`} className="rounded bg-gray-100 px-1 py-0.5 text-[0.9em]">{child}</code>;
      if (mark.type === "link") child = <a key={`${index}-l`} href={String(mark.attrs?.href ?? "#")} className="text-blue-600 underline" target="_blank" rel="noreferrer">{child}</a>;
    }
    return <span key={index}>{child}</span>;
  });
}

function renderBlocks(nodes: RichNode[] = []): ReactNode[] {
  return nodes.map((node, index) => renderBlock(node, index));
}

function textContent(nodes: RichNode[] = []): string {
  return nodes.map((node) => node.text ?? textContent(node.content)).join("");
}

function renderCell(node: RichNode, index: number) {
  const isHeader = node.type === "tableHeader";
  const Tag = isHeader ? "th" : "td";
  const colwidth = Array.isArray(node.attrs?.colwidth) ? Number(node.attrs?.colwidth[0]) : undefined;
  const text = textContent(node.content).trim();
  const isPass = /^(ผ่าน|pass|complied)$/i.test(text);
  const isFail = /^(ไม่ผ่าน|fail|not complied)$/i.test(text);
  return (
    <Tag
      key={index}
      style={colwidth ? { width: colwidth } : undefined}
      className={[
        "border border-gray-300 px-4 py-3 align-top text-left text-sm leading-7",
        isHeader ? "bg-gray-100 text-center text-sm font-bold text-gray-900" : "bg-white text-gray-800",
      ].join(" ")}
    >
      {isPass || isFail ? (
        <span className={isPass ? "inline-flex rounded bg-lime-200 px-2 py-0.5 text-xs font-bold text-lime-900" : "inline-flex rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800"}>
          {text}
        </span>
      ) : (
        renderBlocks(node.content)
      )}
    </Tag>
  );
}

const CALLOUT_STYLES: Record<string, { bg: string; border: string; iconBg: string; text: string; icon: string }> = {
  info:    { bg: "bg-blue-50",   border: "border-blue-200",  iconBg: "bg-blue-600",   text: "text-blue-950",  icon: "i" },
  warning: { bg: "bg-amber-50",  border: "border-amber-200", iconBg: "bg-amber-500",  text: "text-amber-950", icon: "!" },
  error:   { bg: "bg-red-50",    border: "border-red-200",   iconBg: "bg-red-600",    text: "text-red-950",   icon: "✕" },
  success: { bg: "bg-emerald-50",border: "border-emerald-200",iconBg:"bg-emerald-600",text: "text-emerald-950",icon: "✓" },
};

function renderBlock(node: RichNode, index: number): ReactNode {
  switch (node.type) {
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 2), 1), 4);
      const cls = level === 1 ? "text-2xl font-bold" : level === 2 ? "text-xl font-bold" : "text-lg font-semibold";
      const children = renderInline(node.content);
      if (level === 1) return <h1 key={index} className={`${cls} mt-4 mb-2 text-gray-900`}>{children}</h1>;
      if (level === 2) return <h2 key={index} className={`${cls} mt-4 mb-2 text-gray-900`}>{children}</h2>;
      if (level === 3) return <h3 key={index} className={`${cls} mt-4 mb-2 text-gray-900`}>{children}</h3>;
      return <h4 key={index} className={`${cls} mt-4 mb-2 text-gray-900`}>{children}</h4>;
    }

    case "paragraph":
      return <p key={index} className="my-2 whitespace-pre-wrap text-sm leading-7 text-gray-800">{renderInline(node.content)}</p>;

    case "callout": {
      const variant = String(node.attrs?.variant ?? "info");
      const s = CALLOUT_STYLES[variant] ?? CALLOUT_STYLES.info;
      return (
        <div key={index} className={`my-4 flex gap-3 rounded-lg border ${s.bg} ${s.border} px-4 py-3 ${s.text}`}>
          <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${s.iconBg} text-xs font-bold text-white`}>
            {s.icon}
          </span>
          <div className="min-w-0 text-sm leading-7">{renderBlocks(node.content)}</div>
        </div>
      );
    }

    // Legacy panel (blue info) — maps to callout info
    case "panel":
      return (
        <div key={index} className="my-4 flex gap-3 rounded-lg border bg-blue-50 border-blue-200 px-4 py-3 text-blue-950">
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">i</span>
          <div className="min-w-0 text-sm leading-7">{renderBlocks(node.content)}</div>
        </div>
      );

    case "image": {
      const src = String(node.attrs?.src ?? "");
      const alt = String(node.attrs?.alt ?? "");
      return (
        <figure key={index} className="my-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-w-full rounded-lg border border-gray-200" />
          {alt && <figcaption className="mt-1 text-xs text-gray-500">{alt}</figcaption>}
        </figure>
      );
    }

    case "bulletList":
      return <ul key={index} className="my-3 list-disc pl-6 text-sm leading-7">{renderBlocks(node.content)}</ul>;

    case "orderedList":
      return <ol key={index} className="my-3 list-decimal pl-6 text-sm leading-7">{renderBlocks(node.content)}</ol>;

    case "listItem":
      return <li key={index}>{renderBlocks(node.content)}</li>;

    case "codeBlock":
      return (
        <pre key={index} className="my-3 overflow-auto rounded bg-gray-950 p-3 text-xs text-gray-100">
          <code>{textContent(node.content)}</code>
        </pre>
      );

    case "blockquote":
      return <blockquote key={index} className="my-3 border-l-4 border-gray-300 pl-4 text-gray-700">{renderBlocks(node.content)}</blockquote>;

    case "table":
      return (
        <div key={index} className="my-6 overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed border-collapse rounded-lg border border-gray-300 bg-white">
            <tbody>{renderBlocks(node.content)}</tbody>
          </table>
        </div>
      );

    case "tableRow":
      return <tr key={index}>{(node.content ?? []).map(renderCell)}</tr>;

    case "horizontalRule":
      return <hr key={index} className="my-6 border-gray-200" />;

    default:
      return <div key={index}>{renderBlocks(node.content)}</div>;
  }
}

export function RichTextRenderer({ doc, empty = "No description" }: { doc: unknown; empty?: string }) {
  if (!doc || typeof doc !== "object") return <p className="text-sm text-gray-500">{empty}</p>;
  const root = doc as RichNode;
  if (!Array.isArray(root.content) || root.content.length === 0) return <p className="text-sm text-gray-500">{empty}</p>;
  return <div className="jira-rich-text">{renderBlocks(root.content)}</div>;
}
