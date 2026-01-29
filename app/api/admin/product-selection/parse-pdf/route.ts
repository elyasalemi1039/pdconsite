import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Parse PDF to extract BWA product codes
 * Same logic as BWA import page:
 * - Codes start with "BWA" followed by the actual code
 * - Strip "BWA " prefix to get the database code
 * 
 * Examples from PDF:
 * - BWA E1 SH G004 → stored as "E1 SH G004"
 * - BWA E1 SH RS300 → stored as "E1 SH RS300"
 * - BWA J1 JTV08PBB → stored as "J1 JTV08PBB"
 * - BWA A8 CWH66-1500DWM → stored as "A8 CWH66-1500DWM"
 */
function extractProductCodes(text: string): string[] {
  const codes = new Set<string>();
  
  // First, normalize the text by joining lines that are split codes
  // Codes ending with a hyphen continue on the next line
  const lines = text.split(/\n/);
  const normalizedLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    // If line ends with hyphen and next line looks like a continuation
    while (line.endsWith("-") && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      // Check if next line starts with alphanumeric (code continuation)
      if (/^[A-Z0-9]/.test(nextLine)) {
        line = line + nextLine;
        i++;
      } else {
        break;
      }
    }
    
    normalizedLines.push(line);
  }
  
  const normalizedText = normalizedLines.join("\n");
  
  // Pattern: Match lines starting with "BWA " followed by the code
  // The code continues until we hit a line that looks like a product name/description
  // or a price, or end of relevant content
  
  // Find all occurrences of "BWA " followed by code pattern
  // Code pattern: starts with letter+digit (category), then rest of code
  const bwaPattern = /\bBWA\s+([A-Z]\d+(?:\s+[A-Z0-9][A-Z0-9\-_.]*)+)/gi;
  
  let match;
  while ((match = bwaPattern.exec(normalizedText)) !== null) {
    let code = match[1].trim().toUpperCase();
    
    // Clean up the code - remove any trailing numbers that might be quantities
    // or prices that got attached
    code = code.replace(/\s+\$.*$/, ""); // Remove price
    code = code.replace(/\s+\d{4,}$/, ""); // Remove 4+ digit numbers (like years or large quantities)
    
    if (code.length >= 3) {
      codes.add(code);
    }
  }
  
  // Also try a more permissive pattern for codes that might not follow the strict format
  const altPattern = /\bBWA\s+([A-Z]\d+\s+[^\n$]+?)(?=\s*(?:\$|VANITY|TOILET|BATH|BASIN|TAP|SHOWER|DOCCIA|VENEZIA|HAMPSHIRE|PLATEAU|STELLA|SANDRA|JAVA|JESS|SQUARE|\d{4}mm|\d+\s*$))/gi;
  
  while ((match = altPattern.exec(normalizedText)) !== null) {
    let code = match[1].trim().toUpperCase();
    code = code.replace(/\s+\$.*$/, "");
    code = code.replace(/\s+\d{4,}$/, "");
    
    if (code.length >= 3) {
      codes.add(code);
    }
  }
  
  // Parse line by line looking for BWA codes
  for (const line of normalizedLines) {
    const trimmedLine = line.trim();
    
    // Check if line starts with "BWA "
    if (/^BWA\s+/i.test(trimmedLine)) {
      // Extract everything after "BWA " that looks like a code
      let code = trimmedLine.replace(/^BWA\s+/i, "").trim();
      
      // The code typically ends before description words or dimensions
      // Look for patterns like "HAMPSHIRE 1800" where 1800 is a dimension, not part of code
      // But "CWH66-1500DWM" is a full code
      
      // If it ends with just a number (dimension like 1800, 1200), that's not part of code
      const dimensionMatch = code.match(/^(.+?)\s+(\d{3,4})$/);
      if (dimensionMatch && !dimensionMatch[1].includes("-")) {
        // The number is likely a dimension, not part of code
        code = dimensionMatch[1];
      }
      
      // Remove any trailing text that looks like a description
      code = code.split(/\s+(?:VANITY|TOILET|BATH|BASIN|MIXER|SPOUT|SHOWER|HEAD|DROPPER|FILLER|WASTE|PLUG|BUTTON|HOLDER|CISTERN|MATT|SATIN|WHITE|GOLD|BRASS|CHROME|BLACK)/i)[0];
      
      code = code.trim().toUpperCase();
      
      if (code.length >= 3 && /^[A-Z]\d+/.test(code)) {
        codes.add(code);
      }
    }
  }
  
  return Array.from(codes);
}

/**
 * Find fuzzy matches for a code in the product list
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
    
    // Exact match
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
    // Check if significant parts match
    else {
      // Count matching parts
      let matchingParts = 0;
      for (const searchPart of searchParts) {
        if (searchPart.length >= 2) {
          for (const codePart of codeParts) {
            if (codePart === searchPart) {
              matchingParts += 2;
            } else if (codePart.includes(searchPart) || searchPart.includes(codePart)) {
              matchingParts += 1;
            }
          }
        }
      }
      
      if (matchingParts >= 2) {
        score = 30 + matchingParts * 10;
        matchType = "parts";
      }
      
      // Also check substring anywhere
      for (const searchPart of searchParts) {
        if (searchPart.length >= 3 && normalizedCode.includes(searchPart)) {
          score = Math.max(score, 40);
          matchType = matchType || "substring";
        }
      }
    }
    
    if (score > 0) {
      matches.push({ product, score, matchType });
    }
  }
  
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
        debug: extractedText.substring(0, 3000),
      });
    }

    // Get ALL products from database for matching
    const allProducts = await prisma.product.findMany({
      include: { area: true },
    });

    // Try exact matches (case-insensitive, normalized)
    const exactMatches: typeof allProducts = [];
    const notFoundCodes: string[] = [];
    const suggestedMatches: Record<string, Array<{ id: string; code: string; description: string; matchType: string }>> = {};

    for (const code of extractedCodes) {
      // Normalize both for comparison
      const normalizedExtracted = code.toUpperCase().replace(/[\s\-_.]/g, "");
      
      const exactMatch = allProducts.find((p) => {
        const normalizedDb = p.code.toUpperCase().replace(/[\s\-_.]/g, "");
        return normalizedDb === normalizedExtracted || 
               p.code.toUpperCase() === code.toUpperCase();
      });
      
      if (exactMatch) {
        if (!exactMatches.some((m) => m.id === exactMatch.id)) {
          exactMatches.push(exactMatch);
        }
      } else {
        notFoundCodes.push(code);
        
        // Find fuzzy matches
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
      foundCodes: exactMatches.map((p) => p.code),
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
