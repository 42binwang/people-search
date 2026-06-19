"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { RecordFeedbackValue } from "@/lib/db";

type FeedbackState = "idle" | "saving" | "saved" | "error";

export function RecordFeedbackButtons({
  context = "search_result",
  profileId,
  searchToken,
}: Readonly<{
  context?: "search_result" | "profile";
  profileId: string;
  searchToken?: string;
}>) {
  const [selected, setSelected] = useState<RecordFeedbackValue | null>(null);
  const [status, setStatus] = useState<FeedbackState>("idle");

  async function submit(feedback: RecordFeedbackValue) {
    setSelected(feedback);
    setStatus("saving");

    try {
      const response = await fetch("/record-feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          profileId,
          feedback,
          context,
          searchToken,
        }),
      });

      if (!response.ok) {
        throw new Error("Feedback was not saved.");
      }

      setStatus("saved");
    } catch {
      setSelected(null);
      setStatus("error");
    }
  }

  return (
    <div className="record-feedback" aria-label="Record feedback">
      <button
        aria-label="Thumbs up this record"
        className="icon-button"
        data-selected={selected === "up"}
        disabled={status === "saving"}
        onClick={() => void submit("up")}
        title="Helpful record"
        type="button"
      >
        <ThumbsUp size={17} aria-hidden="true" />
      </button>
      <button
        aria-label="Thumbs down this record"
        className="icon-button"
        data-selected={selected === "down"}
        disabled={status === "saving"}
        onClick={() => void submit("down")}
        title="Not useful"
        type="button"
      >
        <ThumbsDown size={17} aria-hidden="true" />
      </button>
      <span className="feedback-status" role="status">
        {status === "saved" && "Saved"}
        {status === "error" && "Try again"}
      </span>
    </div>
  );
}
