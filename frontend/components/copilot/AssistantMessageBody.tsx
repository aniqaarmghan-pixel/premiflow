import type { ReactNode } from "react";

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

/**
 * Lightweight paragraph/list renderer for Assistant chat bubbles.
 * Does not redesign the panel — only improves readable formatting.
 */
export function AssistantMessageBody({ text }: { text: string }) {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="space-y-2.5 text-sm leading-6 text-ink-soft">
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
        const allBullets = lines.every((line) => /^[-*•]\s+/.test(line));
        const allNumbered = lines.every((line) => /^\d+[.)]\s+/.test(line));

        if (allBullets || allNumbered) {
          const ListTag = allNumbered ? "ol" : "ul";
          return (
            <ListTag
              key={blockIndex}
              className={
                allNumbered
                  ? "list-decimal space-y-1 pl-4"
                  : "list-disc space-y-1 pl-4"
              }
            >
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>
                  {renderInline(line.replace(/^([- *•]|\d+[.)])\s+/, ""))}
                </li>
              ))}
            </ListTag>
          );
        }

        return (
          <p key={blockIndex} className="whitespace-pre-wrap">
            {lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {renderInline(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
