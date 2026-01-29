import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Parse PDF to extract product codes
 * Looks for alphanumeric codes that match BWA patterns
 */
function extractProductCodes(text: string): string[] {
  const codes = new Set<string>();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Pattern for product codes - alphanumeric with possible dashes/underscores
  // BWA codes are typically uppercase letters + numbers
  const codePatterns = [
    /\b([A-Z]{2,}[\-_]?[A-Z0-9]{2,}[\-_]?[A-Z0-9]*)\b/g, // e.g. BW-001, ABC123
    /\b([A-Z][A-Z0-9]{4,20})\b/g, // e.g. PROD12345
    /\b([A-Z]{2,4}\d{3,})\b/g, // e.g. BW001, ABC1234
  ];

  for (const line of lines) {
    // Skip header/footer lines
    if (
      line.toLowerCase().includes("product code") ||
      line.toLowerCase().includes("description") ||
      line.toLowerCase().includes("subtotal") ||
      line.toLowerCase().includes("total:") ||
      line.toLowerCase().includes("gst") ||
      line.toLowerCase().includes("page ")
    ) {
      continue;
    }

    for (const pattern of codePatterns) {
      const matches = line.matchAll(pattern);
      for (const match of matches) {
        const code = match[1].toUpperCase();
        // Filter out common non-product strings
        if (
          code.length >= 4 &&
          code.length <= 30 &&
          !["DATE", "QUOTE", "ORDER", "TOTAL", "PRICE", "ITEM", "CODE", "DESC", "NAME", "PAGE", "FROM", "SENT", "EMAIL", "PHONE", "ADDRESS"].includes(code)
        ) {
          codes.add(code);
        }
      }
    }

    // Also try to extract from table-like structures
    // Split by multiple spaces and check first column
    const parts = line.split(/\s{2,}/).filter(Boolean);
    if (parts.length >= 2) {
      const potentialCode = parts[0].trim().toUpperCase();
      if (/^[A-Z][A-Z0-9\-_]{3,}$/.test(potentialCode)) {
        codes.add(potentialCode);
      }
    }
  }

  return Array.from(codes);
}

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("pdf") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });
    }

    if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const pdfData = await pdfParse(buffer);
    const extractedText = pdfData.text;

    // Extract product codes from the PDF
    const extractedCodes = extractProductCodes(extractedText);

    if (extractedCodes.length === 0) {
      return NextResponse.json({
        success: true,
        products: [],
        extractedCodes: [],
        message: "No product codes found in PDF",
      });
    }

    // Look up matching products in the database
    const matchingProducts = await prisma.product.findMany({
      where: {
        code: {
          in: extractedCodes,
        },
      },
      include: {
        area: true,
      },
    });

    // Track which codes were found and which weren't
    const foundCodes = new Set(matchingProducts.map((p) => p.code));
    const notFoundCodes = extractedCodes.filter((c) => !foundCodes.has(c));

    return NextResponse.json({
      success: true,
      products: matchingProducts.map((p) => ({
        id: p.id,
        code: p.code,
        description: p.description,
        productDetails: p.productDetails,
        imageUrl: p.imageUrl,
        link: p.link,
        brand: p.brand,
        keywords: p.keywords,
        area: p.area,
      })),
      extractedCodes,
      foundCodes: Array.from(foundCodes),
      notFoundCodes,
      pageCount: pdfData.numpages,
    });
  } catch (error: unknown) {
    console.error("Error parsing PDF:", error);
    const message = error instanceof Error ? error.message : "Failed to parse PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
