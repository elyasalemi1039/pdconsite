import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Find product codes in PDF text by matching against existing database products
 * This is a generic approach that works with any supplier
 */
function findProductCodesInText(
  text: string, 
  existingCodes: string[]
): { foundCodes: string[]; allMatches: Map<string, string> } {
  const foundCodes: string[] = [];
  const allMatches = new Map<string, string>(); // normalizedCode -> originalCode
  
  // Normalize text for searching
  const normalizedText = text.toUpperCase();
  
  // Try to find each existing product code in the text
  for (const code of existingCodes) {
    const normalizedCode = code.toUpperCase();
    
    // Try exact match first
    if (normalizedText.includes(normalizedCode)) {
      if (!foundCodes.includes(code)) {
        foundCodes.push(code);
        allMatches.set(normalizedCode, code);
      }
      continue;
    }
    
    // Try without spaces/dashes (normalized)
    const compactCode = normalizedCode.replace(/[\s\-_.]/g, "");
    const compactText = normalizedText.replace(/[\s\-_.]/g, "");
    if (compactText.includes(compactCode) && compactCode.length >= 4) {
      if (!foundCodes.includes(code)) {
        foundCodes.push(code);
        allMatches.set(normalizedCode, code);
      }
    }
  }
  
  return { foundCodes, allMatches };
}

/**
 * Extract BWA-style codes from text (for backwards compatibility)
 * Format: BWA [CATEGORY] [CODE...]
 */
function extractBWACodes(text: string): string[] {
  const codes = new Set<string>();
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^BWA\s+/i.test(line)) continue;
    
    let remaining = line.replace(/^BWA\s+/i, "").trim();
    const categoryMatch = remaining.match(/^([A-Z]\d+)\s+(.+)/i);
    if (!categoryMatch) continue;
    
    const category = categoryMatch[1].toUpperCase();
    let codePart = categoryMatch[2].trim();
    
    if (codePart.endsWith("-") && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      const contMatch = nextLine.match(/^([A-Z0-9][A-Z0-9]*)/i);
      if (contMatch) {
        codePart += contMatch[1];
        i++;
      }
    }
    
    const stopWords = [
      "VANITY", "TOILET", "BATH", "BASIN", "MIXER", "SPOUT", 
      "SHOWER", "FILLER", "WASTE", "HOLDER", "CISTERN", "MATT", 
      "SATIN", "WHITE", "GOLD", "BRASS", "CHROME", "BLACK", 
      "OPTIONS", "AVAILABLE", "COLOURS", "HANDLE", "STONE", "TOP",
      "WITH", "AND", "THE", "FOR", "IN", "TO", "MM", "NO"
    ];
    
    const words = codePart.split(/\s+/);
    const codeWords: string[] = [];
    
    for (const word of words) {
      const upperWord = word.toUpperCase();
      if (stopWords.includes(upperWord)) break;
      if (/^[A-Z0-9][A-Z0-9\-_.]*$/i.test(word)) {
        codeWords.push(upperWord);
        if (/^\d{3,4}$/.test(word)) break;
      } else {
        break;
      }
    }
    
    if (codeWords.length > 0) {
      let codeStr = codeWords.join(" ").replace(/-\s+/g, "-").replace(/\s+-/g, "-");
      codes.add(`${category} ${codeStr}`);
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

    // Get ALL products from database first
    const allProducts = await prisma.product.findMany({
      include: { type: true },
    });
    
    const existingCodes = allProducts.map(p => p.code);
    
    // Method 1: Try to find existing product codes directly in the PDF text
    const { foundCodes: directMatches } = findProductCodesInText(extractedText, existingCodes);
    
    // Method 2: Try BWA-style extraction (for backwards compatibility)
    const bwaCodes = extractBWACodes(extractedText);
    
    // Combine both methods
    const allExtractedCodes = [...new Set([...directMatches, ...bwaCodes])];
    
    console.log("Direct matches:", directMatches.length);
    console.log("BWA codes found:", bwaCodes.length);
    console.log("Total unique codes:", allExtractedCodes.length);

    if (allExtractedCodes.length === 0) {
      return NextResponse.json({
        success: true,
        products: [],
        extractedCodes: [],
        suggestedMatches: {},
        message: "No product codes found in PDF. Make sure the products exist in your database first.",
      });
    }

    // Match extracted codes to products
    const exactMatches: typeof allProducts = [];
    const notFoundCodes: string[] = [];
    const suggestedMatches: Record<string, Array<{ id: string; code: string; description: string; matchType: string }>> = {};

    for (const code of allExtractedCodes) {
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
        type: p.type,
      })),
      extractedCodes: allExtractedCodes,
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
