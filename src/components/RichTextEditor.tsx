"use client";

import { useRef } from "react";

type RichTextEditorProps = {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  form?: string;
  minHeightClassName?: string;
};

function insertAtSelection(textarea: HTMLTextAreaElement, before: string, after = "", placeholder = "text") {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const selected = textarea.value.slice(start, end) || placeholder;
  const next = `${textarea.value.slice(0, start)}${before}${selected}${after}${textarea.value.slice(end)}`;
  textarea.value = next;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  const cursorStart = start + before.length;
  const cursorEnd = cursorStart + selected.length;
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(cursorStart, cursorEnd);
  });
}

function insertLinePrefix(textarea: HTMLTextAreaElement, prefix: string, placeholder = "Write here") {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const selected = textarea.value.slice(start, end) || placeholder;
  const lines = selected.split("\n").map((line) => `${prefix}${line || placeholder}`).join("\n");
  textarea.value = `${textarea.value.slice(0, start)}${lines}${textarea.value.slice(end)}`;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  requestAnimationFrame(() => textarea.focus());
}

export function RichTextEditor({ name, defaultValue = "", placeholder, disabled, form, minHeightClassName = "min-h-[220px]" }: RichTextEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const run = (fn: (textarea: HTMLTextAreaElement) => void) => {
    if (!ref.current || disabled) return;
    fn(ref.current);
  };
  const buttonClass = "rounded-lg border border-card-border bg-card px-2.5 py-1.5 text-xs font-extrabold text-ink-secondary hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-card-border bg-page/70 px-3 py-2">
        <button type="button" disabled={disabled} className={buttonClass} onClick={() => run((t) => insertLinePrefix(t, "# ", "Heading"))}>H1</button>
        <button type="button" disabled={disabled} className={buttonClass} onClick={() => run((t) => insertLinePrefix(t, "## ", "Section"))}>H2</button>
        <button type="button" disabled={disabled} className={buttonClass} onClick={() => run((t) => insertAtSelection(t, "**", "**", "bold"))}>Bold</button>
        <button type="button" disabled={disabled} className={buttonClass} onClick={() => run((t) => insertAtSelection(t, "_", "_", "italic"))}>Italic</button>
        <button type="button" disabled={disabled} className={buttonClass} onClick={() => run((t) => insertAtSelection(t, "`", "`", "code"))}>Code</button>
        <button type="button" disabled={disabled} className={buttonClass} onClick={() => run((t) => insertLinePrefix(t, "- ", "List item"))}>Bullets</button>
        <button type="button" disabled={disabled} className={buttonClass} onClick={() => run((t) => insertLinePrefix(t, "1. ", "Step"))}>Numbered</button>
        <button type="button" disabled={disabled} className={buttonClass} onClick={() => run((t) => insertLinePrefix(t, "> ", "Quote"))}>Quote</button>
        <button type="button" disabled={disabled} className={buttonClass} onClick={() => run((t) => insertAtSelection(t, "[", "](https://example.com)", "link text"))}>Link</button>
        <button type="button" disabled={disabled} className={buttonClass} onClick={() => run((t) => insertAtSelection(t, "```\n", "\n```", "code block"))}>Code block</button>
        <button type="button" disabled={disabled} className={buttonClass} onClick={() => run((t) => insertAtSelection(t, "\n| Column A | Column B |\n| --- | --- |\n| Value A | Value B |\n", "", ""))}>Table</button>
      </div>
      <textarea
        ref={ref}
        form={form}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        disabled={disabled}
        className={`${minHeightClassName} w-full resize-y bg-card px-4 py-3 text-sm leading-7 text-ink outline-none placeholder:text-ink-secondary/70 disabled:bg-page disabled:text-ink-secondary`}
      />
      <div className="border-t border-card-border bg-page px-3 py-2 text-[11px] font-semibold text-ink-secondary">
        Supports headings, bold/italic/code, links, lists, quotes, code blocks, and simple Markdown tables. Saved as Workhub rich JSON via existing fields.
      </div>
    </div>
  );
}
