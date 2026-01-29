import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Parse PDF to extract BWA product codes
 * Format: BWA [CATEGORY] [CODE]
 * Examples from actual PDF:
 * - BWA O2 HAMPSHIRE
 * - BWA A8 CWH66-1500DWM (may be split as CWH66- on one line, 1500DWM on next)
 * - BWA J1 JTV08PBB
 * - BWA Z1 JAVA-3178SBG
 * - BWA J1 JTV12PBB.JTV09PBB
 * 
 * Stored in DB without "BWA " prefix, e.g., "O2 HAMPSHIRE", "J1 JTV08PBB"
 */
function extractProductCodes(text: string): string[] {
  const codes = new Set<string>();
  
  // Normalize the text - join lines that end with a hyphen (split codes)
  let normalizedText = text
    .replace(/-\n\s*/g, "-")  // Join hyphenated splits
    .replace(/\.\n\s*/g, ".")  // Join dot splits
    .replace(/\n(?=[A-Z0-9]{3,}(?:DWM|WM|BB|BG|PBB|SBG)\b)/g, "");  // Join code continuations

  // Pattern to match BWA product codes
  // BWA followed by category (letter + digits) and then the product code
  // The product code can contain letters, numbers, dashes, dots
  const bwaRegex = /BWA\s+([A-Z]\d+)\s+([A-Z0-9][A-Z0-9\-_.]*(?:[A-Z0-9])?)/gi;
  
  let match;
  while ((match = bwaRegex.exec(normalizedText)) !== null) {
    const category = match[1].toUpperCase();
    const codePart = match[2].toUpperCase();
    
    // Construct the code as it would be stored in DB (without "BWA " prefix)
    const dbCode = `${category} ${codePart}`;
    codes.add(dbCode);
  }

  // Also look in the original text for the standard format
  const lines = text.split(/\n/);
  let pendingCategory: string | null = null;
  let pendingCodeStart: string | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check if line starts with BWA
    const bwaLineMatch = line.match(/^BWA\s+([A-Z]\d+)\s+(.+)/i);
    if (bwaLineMatch) {
      const category = bwaLineMatch[1].toUpperCase();
      let codePart = bwaLineMatch[2].trim();
      
      // If code ends with hyphen or dot, it might continue on next line
      if (codePart.endsWith("-") || codePart.endsWith(".")) {
        pendingCategory = category;
        pendingCodeStart = codePart;
      } else {
        // Extract just the code portion (first token, may have complex patterns)
        // Codes like: HAMPSHIRE, CWH66-1500DWM, JTV08PBB, JAVA-3178SBG
        const codeMatch = codePart.match(/^([A-Z0-9][A-Z0-9\-_.]+)/i);
        if (codeMatch) {
          const fullCode = `${category} ${codeMatch[1].toUpperCase()}`;
          codes.add(fullCode);
        }
        pendingCategory = null;
        pendingCodeStart = null;
      }
    } else if (pendingCategory && pendingCodeStart) {
      // Check if this line is a continuation of a split code
      const continuation = line.match(/^([A-Z0-9][A-Z0-9\-_.]*)/i);
      if (continuation) {
        const completedCode = pendingCodeStart + continuation[1];
        const fullCode = `${pendingCategory} ${completedCode.toUpperCase()}`;
        codes.add(fullCode);
      }
      pendingCategory = null;
      pendingCodeStart = null;
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

    console.log("Extracted codes:", extractedCodes);

    if (extractedCodes.length === 0) {
      return NextResponse.json({
        success: true,
        products: [],
        extractedCodes: [],
        message: "No product codes found in PDF",
      });
    }

    // Look up matching products in the database
    // Codes in DB are stored as "CATEGORY CODE" e.g., "O2 HAMPSHIRE"
    const matchingProducts = await prisma.product.findMany({
      where: {
        OR: extractedCodes.map((code) => ({
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

    // Track which codes were found
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
