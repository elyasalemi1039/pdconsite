import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Extract codes using BWA format: BWA [CATEGORY] [CODE...]
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
    
    // Handle codes split across lines
    if (codePart.endsWith("-") && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      const contMatch = nextLine.match(/^([A-Z0-9][A-Z0-9]*)/i);
      if (contMatch) {
        codePart += contMatch[1];
        i++;
      }
    }
    
    // Stop words that indicate end of code
    const stopWords = [
      "VANITY", "TOILET", "BATH", "BASIN", "MIXER", "SPOUT", 
      "SHOWER", "FILLER", "WASTE", "HOLDER", "CISTERN", "MATT", 
      "SATIN", "WHITE", "GOLD", "BRASS", "CHROME", "BLACK", 
      "OPTIONS", "AVAILABLE", "COLOURS", "HANDLE", "STONE", "TOP",
      "WITH", "AND", "THE", "FOR", "IN", "TO", "MM", "NO",
      "WALL", "HUNG", "FLOOR", "STANDING", "FREESTANDING"
    ];
    
    const words = codePart.split(/\s+/);
    const codeWords: string[] = [];
    
    for (const word of words) {
      const upperWord = word.toUpperCase();
      if (stopWords.includes(upperWord)) break;
      if (/^[A-Z0-9][A-Z0-9\-_.]*$/i.test(word)) {
        codeWords.push(upperWord);
        if (/^\d{3,4}$/.test(word)) break; // Dimension numbers end the code
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
 * Generic code extraction - looks for patterns like:
 * - Alphanumeric codes (ABC123, A1-B2-C3)
 * - Codes after "Code:" or "Product Code:" labels
 */
function extractGenericCodes(text: string): string[] {
  const codes = new Set<string>();
  
  // Pattern 1: Look for "Code:" or similar labels followed by a code
  const labelPatterns = [
    /(?:product\s*code|code|item|sku|part\s*no|part\s*#)[:\s]+([A-Z0-9][A-Z0-9\-_.]{2,20})/gi,
  ];
  
  for (const pattern of labelPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const code = match[1].trim().toUpperCase();
      if (code.length >= 3 && code.length <= 25) {
        codes.add(code);
      }
    }
  }
  
  // Pattern 2: Look for standalone alphanumeric codes (common formats)
  // Format: 2+ letters followed by numbers and optional suffixes
  const standalonePattern = /\b([A-Z]{2,4}\d{2,6}[A-Z0-9\-]*)\b/g;
  let match;
  while ((match = standalonePattern.exec(text.toUpperCase())) !== null) {
    const code = match[1];
    if (code.length >= 4 && code.length <= 25) {
      codes.add(code);
    }
  }
  
  return Array.from(codes);
}

/**
 * Find fuzzy matches for codes that weren't found exactly
 */
function findFuzzyMatches(
  searchCode: string,
  allProducts: Array<{ id: string; code: string; description: string; [key: string]: any }>
): Array<{ id: string; code: string; description: string; matchType: string }> {
  const normalizedSearch = searchCode.toUpperCase().replace(/[\s\-_.]/g, "");
  const matches: Array<{ product: any; score: number; matchType: string }> = [];
  
  for (const product of allProducts) {
    const normalizedCode = product.code.toUpperCase().replace(/[\s\-_.]/g, "");
    
    let score = 0;
    let matchType = "";
    
    if (normalizedCode === normalizedSearch) {
      score = 100;
      matchType = "exact";
    } else if (normalizedCode.includes(normalizedSearch) && normalizedSearch.length >= 4) {
      score = 80;
      matchType = "contains";
    } else if (normalizedSearch.includes(normalizedCode) && normalizedCode.length >= 4) {
      score = 70;
      matchType = "partial";
    }
    
    if (score > 0) {
      matches.push({ product, score, matchType });
    }
  }
  
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 3).map((m) => ({
    id: m.product.id,
    code: m.product.code,
    description: m.product.description,
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
    const supplierId = formData.get("supplierId")?.toString() || "";

    if (!file) {
      return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });
    }

    if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
    }

    // Get supplier info if provided
    let supplier = null;
    if (supplierId) {
      supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const pdfData = await pdfParse(buffer);
    const extractedText = pdfData.text;

    // Extract codes based on supplier
    let extractedCodes: string[] = [];
    
    if (supplier) {
      const supplierNameLower = supplier.name.toLowerCase();
      
      // BWA-specific parsing
      if (supplierNameLower.includes("bwa") || supplierNameLower.includes("builders warehouse")) {
        extractedCodes = extractBWACodes(extractedText);
        console.log("Using BWA parser, found:", extractedCodes.length, "codes");
      } else {
        // Generic parsing for other suppliers
        extractedCodes = extractGenericCodes(extractedText);
        console.log("Using generic parser, found:", extractedCodes.length, "codes");
      }
    } else {
      // No supplier - try BWA first, then generic
      extractedCodes = extractBWACodes(extractedText);
      if (extractedCodes.length === 0) {
        extractedCodes = extractGenericCodes(extractedText);
      }
      console.log("No supplier specified, found:", extractedCodes.length, "codes");
    }

    if (extractedCodes.length === 0) {
      return NextResponse.json({
        success: true,
        products: [],
        extractedCodes: [],
        suggestedMatches: {},
        message: "No product codes found in PDF. Check that the supplier format is configured correctly.",
      });
    }

    // Now find matching products in database
    // Use WHERE IN for efficiency instead of loading all products
    const normalizedCodes = extractedCodes.map(c => c.toUpperCase());
    
    const matchedProducts = await prisma.product.findMany({
      where: {
        OR: [
          { code: { in: extractedCodes } },
          { code: { in: normalizedCodes } },
        ]
      },
      include: { type: true },
    });

    // Build a map for quick lookup
    const productMap = new Map(matchedProducts.map(p => [p.code.toUpperCase(), p]));
    
    const exactMatches: typeof matchedProducts = [];
    const notFoundCodes: string[] = [];
    
    for (const code of extractedCodes) {
      const product = productMap.get(code.toUpperCase());
      if (product && !exactMatches.some(m => m.id === product.id)) {
        exactMatches.push(product);
      } else if (!product) {
        notFoundCodes.push(code);
      }
    }

    // For not found codes, get fuzzy matches (only load products if needed)
    let suggestedMatches: Record<string, Array<{ id: string; code: string; description: string; matchType: string }>> = {};
    
    if (notFoundCodes.length > 0 && notFoundCodes.length <= 20) {
      // Only do fuzzy matching if there aren't too many missing codes
      const allProducts = await prisma.product.findMany({
        select: { id: true, code: true, description: true },
        take: 500, // Limit for performance
      });
      
      for (const code of notFoundCodes) {
        const fuzzy = findFuzzyMatches(code, allProducts);
        if (fuzzy.length > 0) {
          suggestedMatches[code] = fuzzy;
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
      supplierUsed: supplier?.name || "auto-detect",
    });
  } catch (error: unknown) {
    console.error("Error parsing PDF:", error);
    const message = error instanceof Error ? error.message : "Failed to parse PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
