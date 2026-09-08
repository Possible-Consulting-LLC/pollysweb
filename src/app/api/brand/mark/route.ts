import { NextResponse } from "next/server";
import { LOGO_MARK } from "@/components/brand/logo-data";

export const runtime = "nodejs";

function pngFromDataUrl(dataUrl: string) {
  const [, b64 = ""] = dataUrl.split(",");
  return Buffer.from(b64, "base64");
}

export async function GET() {
  const body = pngFromDataUrl(LOGO_MARK.src);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
