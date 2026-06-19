import { NextRequest, NextResponse } from "next/server";
import { approvePrivacyRequest } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  approvePrivacyRequest(Number(id));
  return NextResponse.redirect(new URL("/admin/privacy", request.url), 303);
}

