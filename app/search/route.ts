import { NextRequest, NextResponse } from "next/server";
import {
  cleanText,
  createStoredSearch,
  normalizeEmail,
  normalizePhone,
  type SearchPayload,
} from "@/lib/search-store";
import {
  checkRequestRateLimit,
  RATE_LIMIT_POLICIES,
  rateLimitHeaders,
} from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const rateLimit = checkRequestRateLimit(request, RATE_LIMIT_POLICIES.search);
  if (!rateLimit.allowed) {
    return new NextResponse("Too many searches. Please try again later.", {
      status: 429,
      headers: rateLimitHeaders(rateLimit),
    });
  }

  const form = await request.formData();
  const mode = cleanText(form.get("mode"));
  const payload = createPayload(mode, form);

  if (!payload) {
    return NextResponse.redirect(new URL("/?search=invalid", request.url), 303);
  }

  const token = createStoredSearch(payload);
  return NextResponse.redirect(
    new URL(`/search/results/${token}`, request.url),
    303,
  );
}

function createPayload(mode: string, form: FormData): SearchPayload | null {
  if (mode === "name") {
    const firstName = cleanText(form.get("firstName"));
    const lastName = cleanText(form.get("lastName"));
    const city = cleanText(form.get("city"));
    const state = cleanText(form.get("state"));

    if (!lastName || (lastName.length < 2 && !firstName)) {
      return null;
    }

    return {
      mode,
      firstName,
      lastName,
      city,
      state,
    };
  }

  if (mode === "phone") {
    const phone = normalizePhone(cleanText(form.get("phone")));
    if (!phone) {
      return null;
    }

    return {
      mode,
      phone,
    };
  }

  if (mode === "email") {
    const email = normalizeEmail(cleanText(form.get("email")));
    if (!email) {
      return null;
    }

    return {
      mode,
      email,
    };
  }

  if (mode === "address") {
    const street = cleanText(form.get("street"));
    const city = cleanText(form.get("city"));
    const state = cleanText(form.get("state"));
    const zip = cleanText(form.get("zip"));

    // Fuzzy/partial address lookup: any meaningful subset is searchable. We do
    // not require street + city + state all at once.
    const hasStreet = street.length >= 3;
    const hasZip = zip.length > 0;
    const hasCityState = city.length > 0 && state.length > 0;
    if (!hasStreet && !hasZip && !hasCityState) {
      return null;
    }

    return {
      mode,
      street,
      city,
      state,
      zip,
    };
  }

  return null;
}
