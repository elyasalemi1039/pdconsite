import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Parse PDF to extract BWA product codes
 * 
 * Code format: BWA [CATEGORY] [CODE_PARTS...]
 * 
 * Database codes (after BWA stripped):
 * - O2 HAMPSHIRE 1800
 * - O3 HAMPSHIRE 1200  
 * - A8 CWH66-1500DWM
 * - J1 JTV08PBB
 * - E1 SH G004
 * - E1 SH RS300
 * - Z1 JAVA-3178SBG
 * - C1 MWBT-5-1700
 */
function extractProductCodes(text: string): string[] {
  const codes = new Set<string>();
  
  // Split into lines and clean up
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if line starts with BWA
    if (!/^BWA\s+/i.test(line)) continue;
    
    // Remove BWA prefix
    let remaining = line.replace(/^BWA\s+/i, "").trim();
    
    // The code starts with category: letter + digit(s) like O2, A8, J1, E1, Z1, C1
    const categoryMatch = remaining.match(/^([A-Z]\d+)\s+(.+)/i);
    if (!categoryMatch) continue;
    
    const category = categoryMatch[1].toUpperCase();
    let codePart = categoryMatch[2].trim();
    
    // If codePart ends with a hyphen, it continues on next line
    if (codePart.endsWith("-") && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      // Take only the first alphanumeric "word"
      const contMatch = nextLine.match(/^([A-Z0-9][A-Z0-9]*)/i);
      if (contMatch) {
        codePart += contMatch[1];
        i++; // Skip the next line since we consumed it
      }
    }
    
    // Now extract the actual product code from codePart
    // The code is the first continuous section of alphanumeric/dash/dot/space characters
    // It ends at description text
    
    // Known product name patterns that ARE part of codes:
    // HAMPSHIRE, CWH66, JTV08PBB, SH, G004, RS300, JAVA, MWBT, etc.
    
    // Words that indicate END of code (these are descriptions):
    const stopWords = [
      "VANITY", "TOILET", "BATH", "BASIN", "MIXER", "SPOUT", 
      "SHOWER", "DROPPER", "FILLER", "WASTE", "PLUG", "BUTTON", 
      "HOLDER", "CISTERN", "MATT", "SATIN", "WHITE", "GOLD", 
      "BRASS", "CHROME", "BLACK", "ROUND", "SQUARE", "CEILING", 
      "WALL", "FLOOR", "STANDING", "OPTIONS", "AVAILABLE", 
      "COLOURS", "HANDLE", "STONE", "TOP", "DIMENSION", "TBC", 
      "PAGE", "QTY", "UNIT", "PRICE", "PRODUCT", "NAME", "PICTURE",
      "BRUSHED", "VENEZIA", "DOCCIA", "OVERHEAD", "RAIN", "COMPLETE", 
      "KIT", "SWIVEL", "HAND", "BRACKET", "ARM", "FREESTANDING", 
      "OVERFLOW", "POP", "DOWN", "INCL", "CONNECTOR", "SUIT", 
      "DOUBLE", "BOWL", "HUNG", "CURVE", "HANDLES", "BUTTONS",
      "WITH", "AND", "THE", "FOR", "IN", "TO", "MM", "NO"
    ];
    
    // Split by whitespace and collect code parts
    const words = codePart.split(/\s+/);
    const codeWords: string[] = [];
    
    for (const word of words) {
      const upperWord = word.toUpperCase();
      
      // If it's a stop word, we're done
      if (stopWords.includes(upperWord)) {
        break;
      }
      
      // If it looks like a code part (alphanumeric with optional dashes/dots)
      if (/^[A-Z0-9][A-Z0-9\-_.]*$/i.test(word)) {
        codeWords.push(upperWord);
        
        // If this word is purely numeric (dimension like 1800, 1200, 900)
        // it's usually the last part of the code
        if (/^\d{3,4}$/.test(word)) {
          break;
        }
      } else {
        // Not a valid code character, stop
        break;
      }
    }
    
    if (codeWords.length > 0) {
      // Join code words, but connect parts that end with hyphen directly to the next part
      let codeStr = "";
      for (let j = 0; j < codeWords.length; j++) {
        const word = codeWords[j];
        if (j === 0) {
          codeStr = word;
        } else {
          // If previous part ends with hyphen, connect directly (no space)
          if (codeStr.endsWith("-")) {
            codeStr += word;
          } else {
            codeStr += " " + word;
          }
        }
      }
      // Final cleanup: remove any spaces around hyphens (e.g., "MWBT-5- 1500" -> "MWBT-5-1500")
      codeStr = codeStr.replace(/-\s+/g, "-").replace(/\s+-/g, "-");
      const fullCode = `${category} ${codeStr}`;
      codes.add(fullCode);
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

    // Get ALL products from database for matching
    const allProducts = await prisma.product.findMany({
      include: { type: true },
    });

    // Try exact matches (case-insensitive, normalized)
    const exactMatches: typeof allProducts = [];
    const notFoundCodes: string[] = [];
    const suggestedMatches: Record<string, Array<{ id: string; code: string; description: string; matchType: string }>> = {};

    for (const code of extractedCodes) {
      // Normalize for comparison
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
