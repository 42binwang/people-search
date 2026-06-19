import { describe, expect, it } from "vitest";
import { normalizeRecordFeedbackPayload } from "@/lib/record-feedback";

describe("record feedback payload normalization", () => {
  it("accepts valid thumbs feedback for search results", () => {
    const result = normalizeRecordFeedbackPayload({
      profileId: "p_demo_jordan_ellis",
      feedback: "up",
      context: "search_result",
      searchToken: "s_abc123",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        profileId: "p_demo_jordan_ellis",
        feedback: "up",
        context: "search_result",
        searchToken: "s_abc123",
      },
    });
  });

  it("accepts down feedback from profile pages", () => {
    const result = normalizeRecordFeedbackPayload({
      profileId: "p_fr_jane_smith_2026-12345",
      feedback: "down",
      context: "profile",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        profileId: "p_fr_jane_smith_2026-12345",
        feedback: "down",
        context: "profile",
        searchToken: null,
      },
    });
  });

  it("rejects malformed payloads and unsupported feedback values", () => {
    expect(normalizeRecordFeedbackPayload(null)).toMatchObject({
      ok: false,
      error: "Feedback payload must be a JSON object.",
    });
    expect(
      normalizeRecordFeedbackPayload({
        profileId: "../bad",
        feedback: "up",
      }),
    ).toMatchObject({
      ok: false,
      error: "A valid profileId is required.",
    });
    expect(
      normalizeRecordFeedbackPayload({
        profileId: "p_demo_jordan_ellis",
        feedback: "maybe",
      }),
    ).toMatchObject({
      ok: false,
      error: "Feedback must be up or down.",
    });
  });

  it("defaults unknown contexts to search_result and trims long tokens", () => {
    const result = normalizeRecordFeedbackPayload({
      profileId: "p_demo_jordan_ellis",
      feedback: "up",
      context: "other",
      searchToken: ` ${"a".repeat(200)} `,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.context).toBe("search_result");
      expect(result.value.searchToken).toHaveLength(160);
    }
  });
});
