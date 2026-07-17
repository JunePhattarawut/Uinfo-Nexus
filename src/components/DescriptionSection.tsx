"use client";

import { useState } from "react";
import { PenLine, Eye } from "lucide-react";
import { RichTextEditor } from "./RichTextEditor";
import { RichTextRenderer } from "./RichTextRenderer";
import { richDocFromMarkdown } from "@/lib/rich-text";

export function DescriptionSection({
  form,
  name,
  defaultValue = "",
  placeholder,
}: {
  form: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [mdValue, setMdValue] = useState(defaultValue);

  const isEmpty = !mdValue.trim();

  return (
    <section className="rounded-2xl border border-card-border bg-card shadow-sm overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-card-border bg-page/50 px-5 py-3">
        <div className="flex items-center gap-2">
          <PenLine size={14} strokeWidth={2} className="text-ink-secondary" />
          <h2 className="font-heading text-[15px] font-extrabold text-ink">Description</h2>
          {isEmpty && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-600 ring-1 ring-amber-200">
              Empty
            </span>
          )}
        </div>

        {/* Write / Preview toggle */}
        <div className="flex items-center rounded-lg border border-card-border bg-page p-0.5">
          <button
            type="button"
            onClick={() => setTab("write")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-semibold transition-all ${
              tab === "write"
                ? "bg-white text-ink shadow-sm"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <PenLine size={11} strokeWidth={2.5} />
            Write
          </button>
          <button
            type="button"
            onClick={() => setTab("preview")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-semibold transition-all ${
              tab === "preview"
                ? "bg-white text-ink shadow-sm"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <Eye size={11} strokeWidth={2.5} />
            Preview
          </button>
        </div>
      </div>

      {/* ── Editor (always mounted so form value is preserved) ── */}
      <div className={tab === "write" ? "" : "hidden"}>
        <RichTextEditor
          form={form}
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          minHeightClassName="min-h-[260px]"
          onChange={setMdValue}
        />
      </div>

      {/* ── Preview ── */}
      {tab === "preview" && (
        <div className="min-h-[260px] px-5 py-5">
          {!isEmpty ? (
            <div className="prose-sm max-w-none">
              <RichTextRenderer doc={richDocFromMarkdown(mdValue)} empty="" />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-ink-secondary">
              <Eye size={28} strokeWidth={1.5} className="opacity-30" />
              <p className="text-[13px]">Nothing to preview yet.</p>
              <p className="text-[12px] opacity-60">Switch to Write and add a description.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
