import { getSessionFromCookies } from "@/lib/auth";
import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParsedProduct = {
  code: string;
  manufacturerDescription: string;
  price: string;
  imageUrl: string;
  notes: string;
};

/**
 * Parse BWA (Builder Warehouse Australia) PDF format
 * Expected format from BWA order/quote PDFs:
 * - Product codes typically follow patterns like "BWA-XXXX" or alphanumeric codes
 * - Prices in AUD format
 * - Product names/descriptions
 */
function parseBWAProducts(text: string): ParsedProduct[] {
  const products: ParsedProduct[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Common patterns in BWA PDFs:
  // 1. Lines with product code, description, quantity, unit price
  // 2. Product codes often start with letters followed by numbers
  // Pattern: CODE | DESCRIPTION | QTY | UNIT PRICE | TOTAL

  // Regular expression for extracting product lines
  // Match: Product code (alphanumeric, possibly with dashes), description, and price
  const productLineRegex = /^([A-Z0-9][A-Z0-9\-_\.\/]{2,30})\s+(.+?)\s+\$?([\d,]+\.?\d{0,2})\s*$/i;
  
  // Alternative pattern: Code at start, price at end (with various separators)
  const altProductRegex = /^([A-Z][A-Z0-9\-_]{2,20})\s+(.{10,}?)\s+(\d+)\s+\$?([\d,]+\.?\d{2})/i;

  // Table-like pattern: splits by multiple spaces or tabs
  const tableRowRegex = /^([A-Z0-9][A-Z0-9\-_\.\/]{2,30})\s{2,}(.+?)\s{2,}(\d+(?:\.\d+)?)\s{2,}\$?([\d,]+\.?\d{0,2})/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip header lines and totals
    if (
      line.toLowerCase().includes("product code") ||
      line.toLowerCase().includes("description") ||
      line.toLowerCase().includes("subtotal") ||
      line.toLowerCase().includes("total") ||
      line.toLowerCase().includes("gst") ||
      line.toLowerCase().includes("tax") ||
      line.toLowerCase().includes("shipping") ||
      line.toLowerCase().includes("freight") ||
      line.toLowerCase().includes("page ")
    ) {
      continue;
    }

    // Try table row pattern first
    let match = line.match(tableRowRegex);
    if (match) {
      products.push({
        code: match[1].trim().toUpperCase(),
        manufacturerDescription: match[2].trim(),
        price: match[4].replace(/,/g, ""),
        imageUrl: "",
        notes: "",
      });
      continue;
    }

    // Try alternative pattern
    match = line.match(altProductRegex);
    if (match) {
      products.push({
        code: match[1].trim().toUpperCase(),
        manufacturerDescription: match[2].trim(),
        price: match[4].replace(/,/g, ""),
        imageUrl: "",
        notes: `Qty: ${match[3]}`,
      });
      continue;
    }

    // Try basic pattern
    match = line.match(productLineRegex);
    if (match) {
      products.push({
        code: match[1].trim().toUpperCase(),
        manufacturerDescription: match[2].trim(),
        price: match[3].replace(/,/g, ""),
        imageUrl: "",
        notes: "",
      });
      continue;
    }

    // More flexible parsing: look for lines that look like product entries
    // Split by multiple spaces and check structure
    const parts = line.split(/\s{2,}/).filter(Boolean);
    if (parts.length >= 3) {
      const potentialCode = parts[0];
      const potentialPrice = parts[parts.length - 1];
      
      // Check if first part looks like a product code (starts with letter, has numbers)
      const looksLikeCode = /^[A-Z][A-Z0-9\-_]{2,}/i.test(potentialCode);
      // Check if last part looks like a price
      const looksLikePrice = /^\$?\d[\d,]*\.?\d{0,2}$/.test(potentialPrice.replace(/\s/g, ""));
      
      if (looksLikeCode && looksLikePrice) {
        const description = parts.slice(1, -1).join(" ");
        products.push({
          code: potentialCode.trim().toUpperCase(),
          manufacturerDescription: description.trim(),
          price: potentialPrice.replace(/[$,\s]/g, ""),
          imageUrl: "",
          notes: "",
        });
      }
    }
  }

  // Deduplicate by code
  const seen = new Set<string>();
  return products.filter((p) => {
    if (seen.has(p.code)) return false;
    seen.add(p.code);
    return true;
  });
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

    const products = parseBWAProducts(extractedText);

    return NextResponse.json({
      success: true,
      products,
      rawText: extractedText.substring(0, 2000), // First 2000 chars for debugging
      pageCount: pdfData.numpages,
    });
  } catch (error: unknown) {
    console.error("Error parsing PDF:", error);
    const message = error instanceof Error ? error.message : "Failed to parse PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


