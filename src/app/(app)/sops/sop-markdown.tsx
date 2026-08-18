"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Booklet page rendered as clean prose (headings, bullets, GFM tables). */
export function SopMarkdown({ text }: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-serif prose-h2:mt-0 prose-h2:text-xl prose-h3:text-base prose-table:text-xs prose-th:bg-muted/40 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-li:my-0.5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
