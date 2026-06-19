import type { RecordFeedbackValue } from "@/lib/db";

export type NormalizedRecordFeedback = {
  profileId: string;
  feedback: RecordFeedbackValue;
  context: "search_result" | "profile";
  searchToken: string | null;
};

export type RecordFeedbackValidationResult =
  | { ok: true; value: NormalizedRecordFeedback }
  | { ok: false; error: string };

export function normalizeRecordFeedbackPayload(
  payload: unknown,
): RecordFeedbackValidationResult {
  if (!isRecord(payload)) {
    return { ok: false, error: "Feedback payload must be a JSON object." };
  }

  const profileId = cleanText(payload.profileId, 160);
  if (!profileId || !/^[a-zA-Z0-9:_-]+$/.test(profileId)) {
    return { ok: false, error: "A valid profileId is required." };
  }

  if (payload.feedback !== "up" && payload.feedback !== "down") {
    return { ok: false, error: "Feedback must be up or down." };
  }

  const context =
    payload.context === "profile" || payload.context === "search_result"
      ? payload.context
      : "search_result";
  const searchToken = cleanOptionalText(payload.searchToken, 160);

  return {
    ok: true,
    value: {
      profileId,
      feedback: payload.feedback,
      context,
      searchToken,
    },
  };
}

function cleanOptionalText(value: unknown, maxLength: number) {
  const cleaned = cleanText(value, maxLength);
  return cleaned || null;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
