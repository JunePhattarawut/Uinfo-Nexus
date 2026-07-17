"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

// ── Slash command definitions ─────────────────────────────────────
type SlashCmd = {
  key: string;
  icon: string;
  label: string;
  desc: string;
  insert: string;
};

const SLASH_COMMANDS: SlashCmd[] = [
  { key: "h1",      icon: "H1",  label: "Heading 1",     desc: "Large section heading",    insert: "# Heading\n" },
  { key: "h2",      icon: "H2",  label: "Heading 2",     desc: "Medium section heading",   insert: "## Heading\n" },
  { key: "h3",      icon: "H3",  label: "Heading 3",     desc: "Small section heading",    insert: "### Heading\n" },
  { key: "bullet",  icon: "•",   label: "Bullet List",   desc: "Unordered list",           insert: "- List item\n" },
  { key: "number",  icon: "1.",  label: "Numbered List", desc: "Ordered list",             insert: "1. List item\n" },
  { key: "quote",   icon: "❝",  label: "Quote",         desc: "Blockquote",               insert: "> Quote text\n" },
  { key: "code",    icon: "</>", label: "Code Block",    desc: "Monospaced code",          insert: "```\ncode here\n```\n" },
  { key: "table",   icon: "⊞",  label: "Table",         desc: "Insert a table",           insert: "| Column A | Column B | Column C |\n| --- | --- | --- |\n| Value 1 | Value 2 | Value 3 |\n| Value 4 | Value 5 | Value 6 |\n" },
  { key: "divider", icon: "—",   label: "Divider",       desc: "Horizontal rule",          insert: "---\n" },
  { key: "info",    icon: "ℹ",  label: "Info",          desc: "Blue info callout",        insert: ":::info\nInfo text here\n:::\n" },
  { key: "warning", icon: "⚠",  label: "Warning",       desc: "Yellow warning callout",   insert: ":::warning\nWarning text here\n:::\n" },
  { key: "success", icon: "✓",  label: "Success",       desc: "Green success callout",    insert: ":::success\nSuccess text here\n:::\n" },
  { key: "error",   icon: "✕",  label: "Error",         desc: "Red error callout",        insert: ":::error\nError text here\n:::\n" },
  { key: "image",   icon: "⬜",  label: "Image",         desc: "Embed image by URL",       insert: "![Alt text](https://example.com/image.jpg)\n" },
];

// ── Text helpers ──────────────────────────────────────────────────
function spliceText(textarea: HTMLTextAreaElement, from: number, to: number, text: string) {
  textarea.value = textarea.value.slice(0, from) + text + textarea.value.slice(to);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  const cur = from + text.length;
  requestAnimationFrame(() => { textarea.focus(); textarea.setSelectionRange(cur, cur); });
}

function insertAtSelection(textarea: HTMLTextAreaElement, before: string, after = "", placeholder = "text") {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const selected = textarea.value.slice(start, end) || placeholder;
  textarea.value = `${textarea.value.slice(0, start)}${before}${selected}${after}${textarea.value.slice(end)}`;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  const cs = start + before.length;
  requestAnimationFrame(() => { textarea.focus(); textarea.setSelectionRange(cs, cs + selected.length); });
}

function insertLinePrefix(textarea: HTMLTextAreaElement, prefix: string, placeholder = "Write here") {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const selected = textarea.value.slice(start, end) || placeholder;
  const lines = selected.split("\n").map((l) => `${prefix}${l || placeholder}`).join("\n");
  textarea.value = `${textarea.value.slice(0, start)}${lines}${textarea.value.slice(end)}`;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  requestAnimationFrame(() => textarea.focus());
}

// ── Component ─────────────────────────────────────────────────────
type SlashMenuState = { triggerPos: number; query: string; selectedIndex: number };

export type RichTextEditorHandle = {
  insertText: (text: string) => void;
  clear: () => void;
};

type RichTextEditorProps = {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  form?: string;
  minHeightClassName?: string;
  onChange?: (value: string) => void;
};

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
function RichTextEditor({
  name,
  defaultValue = "",
  placeholder,
  disabled,
  form,
  minHeightClassName = "min-h-[220px]",
  onChange,
}: RichTextEditorProps, forwardedRef) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(forwardedRef, () => ({
    insertText(text: string) {
      const ta = ref.current;
      if (!ta) return;
      ta.value = ta.value ? `${ta.value}\n${text}` : text;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.focus();
    },
    clear() {
      const ta = ref.current;
      if (!ta) return;
      ta.value = "";
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    },
  }), []);
  const slashPendingRef = useRef(false);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);

  const run = (fn: (t: HTMLTextAreaElement) => void) => {
    if (!ref.current || disabled) return;
    fn(ref.current);
  };

  // Filtered commands based on current query
  const filtered = slashMenu
    ? SLASH_COMMANDS.filter((cmd) => {
        if (!slashMenu.query) return true;
        const q = slashMenu.query.toLowerCase();
        return cmd.label.toLowerCase().includes(q) || cmd.desc.toLowerCase().includes(q);
      })
    : [];

  const closeMenu = () => setSlashMenu(null);

  const execCmd = (cmd: SlashCmd) => {
    if (!ref.current || !slashMenu) return;
    const ta = ref.current;
    const to = ta.selectionStart ?? slashMenu.triggerPos + 1;
    spliceText(ta, slashMenu.triggerPos, to, cmd.insert);
    closeMenu();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    const ta = e.currentTarget;

    // Open slash menu when "/" typed at start of a line
    if (e.key === "/" && !slashMenu) {
      const pos = ta.selectionStart ?? 0;
      const lineStart = ta.value.lastIndexOf("\n", pos - 1) + 1;
      const prefix = ta.value.slice(lineStart, pos).trim();
      if (prefix === "") slashPendingRef.current = true;
      return;
    }

    if (!slashMenu) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSlashMenu((p) => p ? { ...p, selectedIndex: Math.min(p.selectedIndex + 1, filtered.length - 1) } : null);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSlashMenu((p) => p ? { ...p, selectedIndex: Math.max(p.selectedIndex - 1, 0) } : null);
    } else if (e.key === "Enter") {
      const cmd = filtered[slashMenu.selectedIndex];
      if (cmd) { e.preventDefault(); execCmd(cmd); }
    } else if (e.key === "Escape") {
      closeMenu();
    }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    onChange?.(ta.value);

    if (slashPendingRef.current) {
      slashPendingRef.current = false;
      const pos = (ta.selectionStart ?? 1) - 1;
      setSlashMenu({ triggerPos: pos, query: "", selectedIndex: 0 });
      return;
    }

    if (slashMenu) {
      const pos = ta.selectionStart ?? 0;
      const raw = ta.value.slice(slashMenu.triggerPos + 1, pos);
      if (pos <= slashMenu.triggerPos || raw.includes(" ") || raw.includes("\n")) {
        closeMenu();
      } else {
        setSlashMenu((p) => p ? { ...p, query: raw, selectedIndex: 0 } : null);
      }
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!slashMenu) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) closeMenu();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [slashMenu]);

  const btn = "rounded-md border border-card-border bg-card px-2 py-1 text-[11px] font-bold text-ink-secondary hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50";
  const calloutBtn = (extra: string) => `${btn} ${extra}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-card-border bg-page/70 px-3 py-2">
        {/* Text formatting */}
        <button type="button" disabled={disabled} className={btn} onClick={() => run((t) => insertLinePrefix(t, "# ", "Heading"))}>H1</button>
        <button type="button" disabled={disabled} className={btn} onClick={() => run((t) => insertLinePrefix(t, "## ", "Section"))}>H2</button>
        <button type="button" disabled={disabled} className={btn} onClick={() => run((t) => insertLinePrefix(t, "### ", "Subsection"))}>H3</button>
        <span className="h-4 w-px bg-card-border" />
        <button type="button" disabled={disabled} className={btn} onClick={() => run((t) => insertAtSelection(t, "**", "**", "bold"))}>B</button>
        <button type="button" disabled={disabled} className={`${btn} italic`} onClick={() => run((t) => insertAtSelection(t, "_", "_", "italic"))}>I</button>
        <button type="button" disabled={disabled} className={btn} onClick={() => run((t) => insertAtSelection(t, "`", "`", "code"))}>{"<>"}</button>
        <button type="button" disabled={disabled} className={btn} onClick={() => run((t) => insertAtSelection(t, "[", "](https://)", "link text"))}>🔗</button>
        <span className="h-4 w-px bg-card-border" />
        {/* Block types */}
        <button type="button" disabled={disabled} className={btn} onClick={() => run((t) => insertLinePrefix(t, "- ", "List item"))}>• List</button>
        <button type="button" disabled={disabled} className={btn} onClick={() => run((t) => insertLinePrefix(t, "1. ", "Step"))}>1. List</button>
        <button type="button" disabled={disabled} className={btn} onClick={() => run((t) => insertLinePrefix(t, "> ", "Quote"))}>Quote</button>
        <button type="button" disabled={disabled} className={btn} onClick={() => run((t) => insertAtSelection(t, "```\n", "\n```", "code"))}>Code</button>
        <button type="button" disabled={disabled} className={btn} onClick={() => run((t) => insertAtSelection(t, "\n| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n", "", ""))}>Table</button>
        <button type="button" disabled={disabled} className={btn} onClick={() => run((t) => insertAtSelection(t, "![", "](https://example.com/image.jpg)", "Alt text"))}>Image</button>
        <span className="h-4 w-px bg-card-border" />
        {/* Callout variants */}
        <button type="button" disabled={disabled} className={calloutBtn("bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-400")} onClick={() => run((t) => insertAtSelection(t, ":::info\n", "\n:::", "Info text"))}>ℹ Info</button>
        <button type="button" disabled={disabled} className={calloutBtn("bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-400")} onClick={() => run((t) => insertAtSelection(t, ":::warning\n", "\n:::", "Warning text"))}>⚠ Warn</button>
        <button type="button" disabled={disabled} className={calloutBtn("bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-400")} onClick={() => run((t) => insertAtSelection(t, ":::success\n", "\n:::", "Success text"))}>✓ OK</button>
        <button type="button" disabled={disabled} className={calloutBtn("bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-400")} onClick={() => run((t) => insertAtSelection(t, ":::error\n", "\n:::", "Error text"))}>✕ Error</button>
      </div>

      {/* ── Textarea + Slash menu ── */}
      <div className="relative">
        <textarea
          ref={ref}
          form={form}
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder ?? "Type / to insert a block, or write in Markdown…"}
          disabled={disabled}
          className={`${minHeightClassName} w-full resize-y bg-card px-4 py-3 text-sm leading-7 text-ink outline-none placeholder:text-ink-secondary/60 disabled:bg-page disabled:text-ink-secondary`}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
        />

        {/* Slash command dropdown */}
        {slashMenu && filtered.length > 0 && (
          <div className="absolute left-3 top-2 z-50 w-64 overflow-hidden rounded-xl border border-card-border bg-card shadow-2xl">
            <div className="border-b border-card-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">
              {slashMenu.query ? `Search: "${slashMenu.query}"` : "Insert block"}
            </div>
            <ul className="max-h-64 overflow-y-auto py-1">
              {filtered.map((cmd, i) => (
                <li key={cmd.key}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); execCmd(cmd); }}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                      i === slashMenu.selectedIndex ? "bg-accent/10 text-accent" : "text-ink hover:bg-page"
                    }`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-card-border bg-page text-[11px] font-bold text-ink-secondary">
                      {cmd.icon}
                    </span>
                    <span>
                      <span className="block text-[13px] font-semibold leading-tight">{cmd.label}</span>
                      <span className="block text-[11px] text-ink-secondary">{cmd.desc}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="border-t border-card-border bg-page px-3 py-2 text-[11px] text-ink-secondary">
        Type{" "}
        <kbd className="rounded border border-card-border bg-card px-1 font-mono">/</kbd>
        {" "}to insert a block · Markdown supported
      </div>
    </div>
  );
});
