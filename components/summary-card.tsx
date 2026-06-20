"use client";

import { useId, useState } from "react";

/**
 * A summary card that lists short values as pills. Shows the first
 * `initialLimit` values by default; when there are more, a "+N more" toggle
 * expands to reveal every value (and collapses back to "Show less").
 *
 * Rendered as a client component because the page that hosts it is an async
 * server component and the expand/collapse interaction needs local state.
 */
export function SummaryCard({
  title,
  values,
  className = "summary-card",
  initialLimit = 8,
}: Readonly<{
  title: string;
  values: string[];
  className?: string;
  initialLimit?: number;
}>) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();

  const visibleValues = expanded
    ? values
    : values.slice(0, initialLimit);
  const hiddenCount = Math.max(0, values.length - initialLimit);

  return (
    <section className={className}>
      <h3>{title}</h3>
      {values.length > 0 ? (
        <ul className="summary-list" id={listId}>
          {visibleValues.map((value) => (
            <li key={value}>{formatSummaryValue(value)}</li>
          ))}
          {hiddenCount > 0 && (
            <li>
              <button
                type="button"
                className="summary-toggle"
                aria-expanded={expanded}
                aria-controls={listId}
                onClick={() => setExpanded((open) => !open)}
              >
                {expanded ? "Show less" : `+${hiddenCount} more`}
              </button>
            </li>
          )}
        </ul>
      ) : (
        <p className="fine-print">No public entries shown.</p>
      )}
    </section>
  );
}

function formatSummaryValue(value: string) {
  return value || "Unknown";
}
