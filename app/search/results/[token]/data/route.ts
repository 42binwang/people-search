import { NextResponse } from "next/server";
import {
  checkRequestRateLimit,
  RATE_LIMIT_POLICIES,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { loadSearchResults } from "@/lib/search-results";
import { getStoredSearch } from "@/lib/search-store";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ token: string }>;
  },
) {
  const rateLimit = checkRequestRateLimit(
    _request,
    RATE_LIMIT_POLICIES.searchResultsData,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many result refreshes. Please try again later." },
      {
        status: 429,
        headers: rateLimitHeaders(rateLimit),
      },
    );
  }

  const { token } = await params;
  const storedSearch = getStoredSearch(token);

  if (!storedSearch) {
    return NextResponse.json(
      {
        error: "Search expired",
      },
      {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const payload = await loadSearchResults(storedSearch.payload);
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
