import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParsedRow = {
  code: string;
  manufacturerDescription: string;
  price: string;
  imageUrl: string | null;
};

function extractRows(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: ParsedRow[] = [];

  for (const line of lines) {
    // Expect: CODE ... NAME ... PRICE
    // CODE often first token; price near end with decimal
    const priceMatch = line.match(/(\d+[.,]\d{2})/);
    if (!priceMatch) continue;
    const price = priceMatch[1].replace(",", ".");

    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    const code = parts[0];
    const rest = line.replace(code, "").replace(priceMatch[0], "").trim();
    const manufacturerDescription = rest || code;

    rows.push({
      code,
      manufacturerDescription,
      price,
      imageUrl: null,
    });
  }

  return rows;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "PDF file is required" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await pdfParse(buffer);
    const rows = extractRows(parsed.text || "");

    return NextResponse.json({ rows });
  } catch (error: any) {
    console.error("BWA extract error:", error);
    return NextResponse.json(
        { error: "Failed to extract PDF", details: error?.message },
        { status: 500 }
      );
  }
}

