import { NextResponse } from "next/server";
import { createRecordFeedback, getProfile } from "@/lib/db";
import {
  checkRequestRateLimit,
  RATE_LIMIT_POLICIES,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { normalizeRecordFeedbackPayload } from "@/lib/record-feedback";

export async function POST(request: Request) {
  const rateLimit = checkRequestRateLimit(
    request,
    RATE_LIMIT_POLICIES.recordFeedback,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many feedback submissions. Please try again later." },
      {
        status: 429,
        headers: rateLimitHeaders(rateLimit),
      },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Feedback payload must be valid JSON." },
      { status: 400 },
    );
  }

  const normalized = normalizeRecordFeedbackPayload(payload);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  if (!getProfile(normalized.value.profileId)) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  const feedbackId = createRecordFeedback({
    ...normalized.value,
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json(
    { feedbackId, status: "recorded" },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
