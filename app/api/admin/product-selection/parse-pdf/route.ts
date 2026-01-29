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

/**
 * Find fuzzy matches for a code in the product list
 * Returns products where the code contains the search term or vice versa
 */
function findFuzzyMatches(
  searchCode: string,
  allProducts: Array<{ id: string; code: string; description: string; [key: string]: any }>
): Array<{ id: string; code: string; description: string; matchType: string; [key: string]: any }> {
  const normalizedSearch = searchCode.toUpperCase().replace(/[\s\-_.]/g, "");
  const searchParts = searchCode.toUpperCase().split(/[\s\-_.]+/).filter(Boolean);
  
  const matches: Array<{ product: any; score: number; matchType: string }> = [];
  
  for (const product of allProducts) {
    const normalizedCode = product.code.toUpperCase().replace(/[\s\-_.]/g, "");
    const codeParts = product.code.toUpperCase().split(/[\s\-_.]+/).filter(Boolean);
    
    let score = 0;
    let matchType = "";
    
    // Exact match (already handled, but include for completeness)
    if (normalizedCode === normalizedSearch) {
      score = 100;
      matchType = "exact";
    }
    // Search code is contained in product code
    else if (normalizedCode.includes(normalizedSearch)) {
      score = 80;
      matchType = "contains";
    }
    // Product code is contained in search code
    else if (normalizedSearch.includes(normalizedCode)) {
      score = 70;
      matchType = "partial";
    }
    // Any part of the search matches any part of the code
    else {
      for (const searchPart of searchParts) {
        if (searchPart.length >= 3) {
          for (const codePart of codeParts) {
            if (codePart.includes(searchPart)) {
              score = Math.max(score, 50);
              matchType = "part-match";
            } else if (searchPart.includes(codePart) && codePart.length >= 3) {
              score = Math.max(score, 40);
              matchType = "part-match";
            }
          }
          // Also check if part appears anywhere in the full code
          if (normalizedCode.includes(searchPart)) {
            score = Math.max(score, 45);
            matchType = "substring";
          }
        }
      }
    }
    
    if (score > 0) {
      matches.push({ product, score, matchType });
    }
  }
  
  // Sort by score descending and take top matches
  matches.sort((a, b) => b.score - a.score);
  
  return matches.slice(0, 5).map((m) => ({
    ...m.product,
    matchType: m.matchType,
  }));
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
        suggestedMatches: {},
        message: "No product codes found in PDF",
      });
    }

    // Get ALL products from database for fuzzy matching
    const allProducts = await prisma.product.findMany({
      include: { area: true },
    });

    // First try exact matches (case-insensitive)
    const exactMatches: typeof allProducts = [];
    const notFoundCodes: string[] = [];
    const suggestedMatches: Record<string, Array<{ id: string; code: string; description: string; matchType: string }>> = {};

    for (const code of extractedCodes) {
      const exactMatch = allProducts.find(
        (p) => p.code.toUpperCase() === code.toUpperCase()
      );
      
      if (exactMatch) {
        // Avoid duplicates
        if (!exactMatches.some((m) => m.id === exactMatch.id)) {
          exactMatches.push(exactMatch);
        }
      } else {
        notFoundCodes.push(code);
        
        // Find fuzzy matches for this code
        const fuzzyMatches = findFuzzyMatches(code, allProducts);
        if (fuzzyMatches.length > 0) {
          suggestedMatches[code] = fuzzyMatches.map((m) => ({
            id: m.id,
            code: m.code,
            description: m.description,
            matchType: m.matchType,
          }));
        }
      }
    }

    const foundCodes = exactMatches.map((p) => p.code);

    return NextResponse.json({
      success: true,
      products: exactMatches.map((p) => ({
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
      foundCodes,
      notFoundCodes,
      suggestedMatches,
      pageCount: pdfData.numpages,
    });
  } catch (error: unknown) {
    console.error("Error parsing PDF:", error);
    const message = error instanceof Error ? error.message : "Failed to parse PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
