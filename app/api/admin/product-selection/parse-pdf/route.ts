import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import PizZip from "pizzip";
import { parseStringPromise } from "xml2js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ColumnMapping = {
  column: number;
  field: string;
};

/**
 * Convert PDF to DOCX using CloudConvert (same as import)
 */
async function convertPdfToDocx(pdfBuffer: Buffer): Promise<Buffer> {
  const CloudConvert = (await import("cloudconvert")).default;
  const cloudConvert = new CloudConvert(process.env.CLOUDCONVERT_API_KEY!);

  const job = await cloudConvert.jobs.create({
    tasks: {
      "upload-pdf": {
        operation: "import/upload",
      },
      "convert-to-docx": {
        operation: "convert",
        input: "upload-pdf",
        output_format: "docx",
      },
      "export-docx": {
        operation: "export/url",
        input: "convert-to-docx",
      },
    },
  });

  const uploadTask = job.tasks.find((t: any) => t.name === "upload-pdf");
  if (!uploadTask) {
    throw new Error("Upload task not found");
  }

  await cloudConvert.tasks.upload(uploadTask, pdfBuffer, "document.pdf");

  const completedJob = await cloudConvert.jobs.wait(job.id);

  const exportTask = completedJob.tasks.find((t: any) => t.name === "export-docx");
  if (!exportTask?.result?.files?.[0]?.url) {
    throw new Error("Export task failed or no file URL");
  }

  const docxUrl = exportTask.result.files[0].url;
  const docxResponse = await fetch(docxUrl);
  if (!docxResponse.ok) {
    throw new Error("Failed to download converted DOCX");
  }

  return Buffer.from(await docxResponse.arrayBuffer());
}

/**
 * Extract product codes from DOCX using supplier's column mappings (same logic as import)
 */
async function extractCodesFromDocx(
  docxBuffer: Buffer,
  columnMappings: ColumnMapping[],
  startRow: number = 2
): Promise<string[]> {
  const zip = new PizZip(docxBuffer);
  const codes: string[] = [];

  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("No document.xml found in DOCX");
  }

  const docXml = docFile.asText();
  const docData = await parseStringPromise(docXml, { explicitArray: false });

  // Helper to extract text from a node
  const extractText = (node: any): string => {
    if (!node) return "";
    if (typeof node === "string") return node;
    if (node["w:t"]) {
      const t = node["w:t"];
      if (typeof t === "string") return t;
      if (typeof t === "object" && t._) return t._;
      if (Array.isArray(t)) return t.map(extractText).join("");
      return "";
    }
    if (node["w:r"]) {
      const runs = Array.isArray(node["w:r"]) ? node["w:r"] : [node["w:r"]];
      return runs.map(extractText).join("");
    }
    if (node["w:p"]) {
      const paras = Array.isArray(node["w:p"]) ? node["w:p"] : [node["w:p"]];
      return paras.map(extractText).join(" ");
    }
    return "";
  };

  // Find which column has the code field
  const codeColumn = columnMappings.find(m => m.field === "code")?.column;
  if (!codeColumn) {
    throw new Error("Supplier has no 'code' column mapped");
  }

  const body = docData?.["w:document"]?.["w:body"];
  if (!body) {
    throw new Error("No body found in document");
  }

  const tables = body["w:tbl"];
  const tableList = tables ? (Array.isArray(tables) ? tables : [tables]) : [];

  for (const table of tableList) {
    const rows = table["w:tr"];
    const rowList = rows ? (Array.isArray(rows) ? rows : [rows]) : [];

    for (let i = startRow - 1; i < rowList.length; i++) {
      const row = rowList[i];
      const cells = row["w:tc"];
      const cellList = cells ? (Array.isArray(cells) ? cells : [cells]) : [];

      // Get the code from the configured column
      const codeCell = cellList[codeColumn - 1]; // 1-indexed to 0-indexed
      if (codeCell) {
        let code = extractText(codeCell).trim();
        
        // Clean up the code - remove BWA prefix if present
        if (code.toUpperCase().startsWith("BWA")) {
          code = code.substring(3).trim();
          code = code.replace(/^[-\s]+/, "");
        }
        
        // Skip empty or too short codes
        if (code && code.length >= 3 && !shouldSkip(code)) {
          codes.push(code);
        }
      }
    }
  }

  return codes;
}

/**
 * Legacy extraction for BWA format (no supplier configured)
 */
async function extractCodesFromDocxLegacy(docxBuffer: Buffer): Promise<string[]> {
  const zip = new PizZip(docxBuffer);
  const codes: string[] = [];

  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("No document.xml found in DOCX");
  }

  const docXml = docFile.asText();
  const docData = await parseStringPromise(docXml, { explicitArray: false });

  const extractText = (node: any): string => {
    if (!node) return "";
    if (typeof node === "string") return node;
    if (node["w:t"]) {
      const t = node["w:t"];
      if (typeof t === "string") return t;
      if (typeof t === "object" && t._) return t._;
      if (Array.isArray(t)) return t.map(extractText).join("");
      return "";
    }
    if (node["w:r"]) {
      const runs = Array.isArray(node["w:r"]) ? node["w:r"] : [node["w:r"]];
      return runs.map(extractText).join("");
    }
    if (node["w:p"]) {
      const paras = Array.isArray(node["w:p"]) ? node["w:p"] : [node["w:p"]];
      return paras.map(extractText).join(" ");
    }
    return "";
  };

  const body = docData?.["w:document"]?.["w:body"];
  if (!body) return codes;

  const tables = body["w:tbl"];
  const tableList = tables ? (Array.isArray(tables) ? tables : [tables]) : [];

  for (const table of tableList) {
    const rows = table["w:tr"];
    const rowList = rows ? (Array.isArray(rows) ? rows : [rows]) : [];

    for (let i = 1; i < rowList.length; i++) {
      const row = rowList[i];
      const cells = row["w:tc"];
      const cellList = cells ? (Array.isArray(cells) ? cells : [cells]) : [];

      for (const cell of cellList) {
        const cellText = extractText(cell).trim();
        
        // Look for BWA codes or alphanumeric product codes
        if (cellText.match(/^BWA/i) || cellText.match(/^[A-Z]{1,2}\d+\s+[A-Z0-9\-]/i)) {
          let code = cellText;
          
          if (code.toUpperCase().startsWith("BWA")) {
            code = code.substring(3).trim().replace(/^[-\s]+/, "");
          }
          
          if (code && code.length >= 3 && !shouldSkip(code)) {
            codes.push(code);
          }
        }
      }
    }
  }

  return codes;
}

/**
 * Check if text should be skipped (headers, categories, etc.)
 */
function shouldSkip(text: string): boolean {
  if (!text || text.length < 2) return true;
  
  const upper = text.toUpperCase();
  
  if (text.match(/\d{4}\s?\d{3}\s?\d{3}/) || text.match(/\(\d{2}\)\s?\d{4}/)) {
    return true;
  }
  
  if (text.includes("@") || text.toLowerCase().includes(".com.au")) {
    return true;
  }
  
  const skipWords = [
    "ABN", "PTY LTD", "LIMITED", "WAREHOUSE", "PHONE", "EMAIL", "FAX", 
    "ADDRESS", "WWW.", "QTY", "QUANTITY", "PRICE", "TOTAL", "SUBTOTAL",
    "PRODUCT NAME", "PRODUCT CODE", "DESCRIPTION", "UNIT PRICE", "PICTURE",
    "DIMENSION", "GST", "EX GST", "INC GST"
  ];
  
  if (skipWords.some(word => upper === word || upper.includes(word))) {
    return true;
  }
  
  const categories = [
    "BASINS", "TAPS", "TOILETS", "SHOWERS", "BATHS", "VANITIES", 
    "KITCHEN", "BATHROOM", "ACCESSORIES", "MIXERS", "SINKS", "MIXER",
    "VANITY OPTIONS", "STONE TOP OPTIONS", "HANDLE OPTIONS"
  ];
  if (categories.includes(upper)) {
    return true;
  }
  
  return false;
}

/**
 * Find fuzzy matches for codes that weren't found exactly
 */
function findFuzzyMatches(
  searchCode: string,
  allProducts: Array<{ id: string; code: string; description: string }>
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
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Get supplier info if provided
    let supplier = null;
    if (supplierId) {
      supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name.toLowerCase();
    
    // Convert PDF to DOCX using CloudConvert (same as import)
    let docxBuffer: Buffer;
    
    if (fileName.endsWith(".pdf") || file.type.includes("pdf")) {
      console.log("Converting PDF to DOCX...");
      docxBuffer = await convertPdfToDocx(buffer);
      console.log("Conversion complete");
    } else if (fileName.endsWith(".docx")) {
      docxBuffer = buffer;
    } else {
      return NextResponse.json({ error: "File must be a PDF or DOCX" }, { status: 400 });
    }

    // Extract codes using the same logic as import
    let extractedCodes: string[] = [];
    
    if (supplier && supplier.columnMappings) {
      const mappings = supplier.columnMappings as ColumnMapping[];
      extractedCodes = await extractCodesFromDocx(docxBuffer, mappings, supplier.startRow);
      console.log(`Extracted ${extractedCodes.length} codes using supplier "${supplier.name}" config`);
    } else {
      extractedCodes = await extractCodesFromDocxLegacy(docxBuffer);
      console.log(`Extracted ${extractedCodes.length} codes using legacy parser`);
    }

    // Remove duplicates
    extractedCodes = [...new Set(extractedCodes)];

    if (extractedCodes.length === 0) {
      return NextResponse.json({
        success: true,
        products: [],
        extractedCodes: [],
        suggestedMatches: {},
        message: "No product codes found. Check that the supplier format is configured correctly.",
      });
    }

    // Find matching products in database
    const normalizedCodes = extractedCodes.map(c => c.toUpperCase().replace(/[\s\-_.]/g, ""));
    
    // Get all products and match by normalized code
    const allDbProducts = await prisma.product.findMany({
      include: { type: true },
    });

    // Create a normalized lookup map
    const normalizedProductMap = new Map<string, typeof allDbProducts[0]>();
    for (const product of allDbProducts) {
      const normalized = product.code.toUpperCase().replace(/[\s\-_.]/g, "");
      normalizedProductMap.set(normalized, product);
    }

    const exactMatches: typeof allDbProducts = [];
    const notFoundCodes: string[] = [];
    const matchedIds = new Set<string>();
    
    for (let i = 0; i < extractedCodes.length; i++) {
      const code = extractedCodes[i];
      const normalized = normalizedCodes[i];
      const product = normalizedProductMap.get(normalized);
      
      if (product && !matchedIds.has(product.id)) {
        exactMatches.push(product);
        matchedIds.add(product.id);
      } else if (!product) {
        notFoundCodes.push(code);
      }
    }

    // For not found codes, get fuzzy matches
    let suggestedMatches: Record<string, Array<{ id: string; code: string; description: string; matchType: string }>> = {};
    
    if (notFoundCodes.length > 0 && notFoundCodes.length <= 20) {
      const productsForFuzzy = allDbProducts.map(p => ({
        id: p.id,
        code: p.code,
        description: p.description,
      }));
      
      for (const code of notFoundCodes) {
        const fuzzy = findFuzzyMatches(code, productsForFuzzy);
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
      supplierUsed: supplier?.name || "auto-detect",
    });
  } catch (error: unknown) {
    console.error("Error parsing PDF:", error);
    const message = error instanceof Error ? error.message : "Failed to parse PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
