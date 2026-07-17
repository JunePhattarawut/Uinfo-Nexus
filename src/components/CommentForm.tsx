"use client";

import { useRef, useState, useTransition } from "react";
import { Eye, PenLine } from "lucide-react";
import { RichTextEditor, type RichTextEditorHandle } from "./RichTextEditor";
import { RichTextRenderer } from "./RichTextRenderer";
import { richDocFromMarkdown } from "@/lib/rich-text";

const PRESETS = [
  { emoji: "🎉", text: "Looks good!",         color: "hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200" },
  { emoji: "👋", text: "Need help?",           color: "hover:bg-blue-50   hover:text-blue-700   hover:border-blue-200"   },
  { emoji: "⛔", text: "This is blocked...",   color: "hover:bg-red-50    hover:text-red-700    hover:border-red-200"    },
  { emoji: "🔍", text: "Can you clarify...?",  color: "hover:bg-amber-50  hover:text-amber-700  hover:border-amber-200"  },
  { emoji: "✅", text: "This is on track",     color: "hover:bg-teal-50   hover:text-teal-700   hover:border-teal-200"   },
];

export function CommentForm({
  action,
  authorInitial,
}: {
  action: (formData: FormData) => Promise<void>;
  authorInitial: string;
}) {
  const editorRef = useRef<RichTextEditorHandle>(null);
  const formRef   = useRef<HTMLFormElement>(null);

  const [tab, setTab]       = useState<"write" | "preview">("write");
  const [mdValue, setMdValue] = useState("");
  const [isPending, startTransition] = useTransition();

  const isEmpty = !mdValue.trim();

  function insertPreset(text: string) {
    editorRef.current?.insertText(text);
    setTab("write");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isEmpty) return;
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await action(formData);
      editorRef.current?.clear();
      setMdValue("");
      setTab("write");
    });
  }

  return (
    <div className="flex gap-3" id="comments">
      {/* Avatar */}
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
        {authorInitial}
      </div>

      <div className="min-w-0 flex-1">
        <div className="overflow-hidden rounded-xl border border-card-border bg-white shadow-sm transition-shadow focus-within:shadow-md focus-within:border-accent/40">

          {/* ── Header: label + Write/Preview toggle ── */}
          <div className="flex items-center justify-between border-b border-card-border/60 bg-page/50 px-3 py-2">
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-secondary">
              <PenLine size={11} strokeWidth={2.5} />
              Comment
            </span>
            <div className="flex items-center rounded-lg border border-card-border bg-page p-0.5">
              <button
                type="button"
                onClick={() => setTab("write")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  tab === "write" ? "bg-white text-ink shadow-sm" : "text-ink-secondary hover:text-ink"
                }`}
              >
                Write
              </button>
              <button
                type="button"
                onClick={() => setTab("preview")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  tab === "preview" ? "bg-white text-ink shadow-sm" : "text-ink-secondary hover:text-ink"
                }`}
              >
                <Eye size={10} strokeWidth={2.5} />
                Preview
              </button>
            </div>
          </div>

          <form ref={formRef} onSubmit={handleSubmit}>
            {/* ── Editor (always mounted) ── */}
            <div className={tab === "write" ? "" : "hidden"}>
              <RichTextEditor
                ref={editorRef}
                name="bodyText"
                placeholder="Write a comment… (Markdown & / commands supported)"
                minHeightClassName="min-h-[100px]"
                onChange={setMdValue}
              />
            </div>

            {/* ── Preview ── */}
            {tab === "preview" && (
              <div className="min-h-[100px] px-4 py-4">
                {!isEmpty ? (
                  <div className="prose-sm max-w-none">
                    <RichTextRenderer doc={richDocFromMarkdown(mdValue)} empty="" />
                  </div>
                ) : (
                  <p className="text-[13px] italic text-ink-secondary/60">Nothing to preview yet.</p>
                )}
              </div>
            )}

            {/* ── Footer: presets + submit ── */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-card-border/60 bg-gray-50/70 px-3 py-2">
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.text}
                    type="button"
                    onClick={() => insertPreset(p.text)}
                    title={p.text}
                    className={`flex items-center gap-1 rounded-full border border-card-border bg-white px-2 py-0.5 text-[11px] font-medium text-ink-secondary transition-all ${p.color} hover:shadow-sm`}
                  >
                    <span className="text-[12px] leading-none">{p.emoji}</span>
                    <span className="hidden sm:inline">{p.text}</span>
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={isPending || isEmpty}
                className="shrink-0 rounded-lg bg-[var(--wh-accent)] px-4 py-1.5 text-[12.5px] font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isPending ? "Posting…" : "Comment"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
