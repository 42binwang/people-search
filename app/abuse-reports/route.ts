import { NextRequest, NextResponse } from "next/server";
import { createAbuseReport } from "@/lib/db";
import { cleanText } from "@/lib/search-store";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const id = createAbuseReport({
    profileId: cleanText(form.get("profileId")),
    reporterName: cleanText(form.get("name")),
    reporterEmail: cleanText(form.get("email")),
    details: [cleanText(form.get("subject")), cleanText(form.get("message"))]
      .filter(Boolean)
      .join("\n\n"),
  });

  return NextResponse.redirect(
    new URL(`/request-submitted?kind=report&id=${id}`, request.url),
    303,
  );
}

