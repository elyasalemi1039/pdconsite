import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Parse PDF to extract product codes
 * BWA codes typically have format like:
 * - BWAXXXXX (with BWA prefix)
 * - Just the code after BWA is stripped (e.g., T123, BAM001, etc.)
 */
function extractProductCodes(text: string): string[] {
  const codes = new Set<string>();
  
  // BWA format: look for "BWA" prefix followed by code
  // e.g., "BWA-T123" or "BWAT123" or "BWA T123"
  const bwaRegex = /\bBWA[-\s]?([A-Z0-9][A-Z0-9\-_.]{1,30})\b/gi;
  let match;
  while ((match = bwaRegex.exec(text)) !== null) {
    const code = match[1].toUpperCase().trim();
    if (code.length >= 2 && code.length <= 30) {
      codes.add(code);
    }
  }

  // Also look for standalone product codes that match common patterns
  // Pattern: 2-4 letters followed by numbers and possibly more characters
  const codePatterns = [
    /\b([A-Z]{1,4}[-]?\d{2,}[A-Z0-9\-_.]*)\b/g,  // e.g., T123, BAM001, WB-450
    /\b([A-Z]{2,}[-]?\d+[-]?[A-Z0-9]*)\b/g,       // e.g., BAM001, TB123
    /\b(\d{5,}[A-Z]*)\b/g,                         // e.g., 12345, 123456A
  ];

  const lines = text.split("\n");
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip header/footer lines
    if (
      trimmedLine.toLowerCase().includes("product code") ||
      trimmedLine.toLowerCase().includes("description") ||
      trimmedLine.toLowerCase().includes("subtotal") ||
      trimmedLine.toLowerCase().includes("total:") ||
      trimmedLine.toLowerCase().includes("total ") ||
      trimmedLine.toLowerCase().includes("gst") ||
      trimmedLine.toLowerCase().includes("page ") ||
      trimmedLine.toLowerCase().includes("phone") ||
      trimmedLine.toLowerCase().includes("email") ||
      trimmedLine.toLowerCase().includes("www.") ||
      trimmedLine.toLowerCase().includes(".com")
    ) {
      continue;
    }

    for (const pattern of codePatterns) {
      pattern.lastIndex = 0;
      while ((match = pattern.exec(trimmedLine)) !== null) {
        const code = match[1].toUpperCase();
        // Filter out common non-product strings
        const skipWords = [
          "DATE", "QUOTE", "ORDER", "TOTAL", "PRICE", "ITEM", "CODE", 
          "DESC", "NAME", "PAGE", "FROM", "SENT", "EMAIL", "PHONE", 
          "ADDRESS", "QTY", "QUANTITY", "UNIT", "AMOUNT", "ABN", "ACN"
        ];
        
        if (
          code.length >= 3 &&
          code.length <= 30 &&
          !skipWords.includes(code)
        ) {
          codes.add(code);
        }
      }
    }

    // Also try splitting by whitespace and checking first "column"
    const parts = trimmedLine.split(/\s{2,}/).filter(Boolean);
    if (parts.length >= 2) {
      const potentialCode = parts[0].trim().toUpperCase();
      // Looks like a product code if alphanumeric mix
      if (
        /^[A-Z0-9][A-Z0-9\-_.]{2,}$/i.test(potentialCode) &&
        potentialCode.length >= 3 &&
        potentialCode.length <= 30
      ) {
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
    // Try both exact match and case-insensitive
    const matchingProducts = await prisma.product.findMany({
      where: {
        OR: extractedCodes.map(code => ({
          code: {
            equals: code,
            mode: "insensitive" as const,
          },
        })),
      },
      include: {
        area: true,
      },
    });

    // Track which codes were found and which weren't
    const foundCodes = new Set(matchingProducts.map((p) => p.code.toUpperCase()));
    const notFoundCodes = extractedCodes.filter((c) => !foundCodes.has(c.toUpperCase()));

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
