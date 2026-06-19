import { NextRequest, NextResponse } from "next/server";
import { createPrivacyRequest } from "@/lib/db";
import {
  checkRequestRateLimit,
  RATE_LIMIT_POLICIES,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { cleanText } from "@/lib/search-store";

export async function POST(request: NextRequest) {
  const rateLimit = checkRequestRateLimit(
    request,
    RATE_LIMIT_POLICIES.privacyRequests,
  );
  if (!rateLimit.allowed) {
    return new NextResponse(
      "Too many privacy requests. Please try again later.",
      {
        status: 429,
        headers: rateLimitHeaders(rateLimit),
      },
    );
  }

  const form = await request.formData();
  const id = createPrivacyRequest({
    type: cleanText(form.get("type")) || "opt-out",
    profileId: cleanText(form.get("profileId")),
    requesterName: cleanText(form.get("name")),
    requesterEmail: cleanText(form.get("email")),
    details: cleanText(form.get("message")) || cleanText(form.get("subject")),
  });

  return NextResponse.redirect(
    new URL(`/request-submitted?kind=privacy&id=${id}`, request.url),
    303,
  );
}
