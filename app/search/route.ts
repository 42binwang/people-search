import { NextRequest, NextResponse } from "next/server";
import {
  cleanText,
  createStoredSearch,
  normalizePhone,
  type SearchPayload,
} from "@/lib/search-store";

export async function POST(request: NextRequest) {
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

  if (mode === "address") {
    const street = cleanText(form.get("street"));
    const city = cleanText(form.get("city"));
    const state = cleanText(form.get("state"));
    const zip = cleanText(form.get("zip"));

    if (!street || !city || !state) {
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

