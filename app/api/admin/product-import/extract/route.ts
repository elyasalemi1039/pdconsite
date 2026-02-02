import { NextResponse } from "next/server";
import PizZip from "pizzip";
import { parseStringPromise } from "xml2js";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ColumnMapping = {
  column: number;
  field: string;
};

type ExtractedProduct = {
  code: string;
  description: string;
  imageBase64: string | null;
  price?: string;
  productDetails?: string;
  brand?: string;
  keywords?: string;
  link?: string;
  area?: string;
};

async function convertPdfToDocx(pdfBuffer: Buffer): Promise<Buffer> {
  const CloudConvert = (await import("cloudconvert")).default;
  const cloudConvert = new CloudConvert(process.env.CLOUDCONVERT_API_KEY!);

  // Create a job that uploads, converts, and exports
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

  // Find the upload task and upload the PDF
  const uploadTask = job.tasks.find((t: any) => t.name === "upload-pdf");
  if (!uploadTask) {
    throw new Error("Upload task not found");
  }

  await cloudConvert.tasks.upload(uploadTask, pdfBuffer, "document.pdf");

  // Wait for the job to complete
  const completedJob = await cloudConvert.jobs.wait(job.id);

  // Find the export task and get the file URL
  const exportTask = completedJob.tasks.find((t: any) => t.name === "export-docx");
  if (!exportTask?.result?.files?.[0]?.url) {
    throw new Error("Export task failed or no file URL");
  }

  // Download the DOCX
  const docxUrl = exportTask.result.files[0].url;
  const docxResponse = await fetch(docxUrl);
  if (!docxResponse.ok) {
    throw new Error("Failed to download converted DOCX");
  }

  return Buffer.from(await docxResponse.arrayBuffer());
}

async function extractFromDocx(
  docxBuffer: Buffer,
  columnMappings: ColumnMapping[],
  startRow: number = 2
): Promise<ExtractedProduct[]> {
  const zip = new PizZip(docxBuffer);
  const products: ExtractedProduct[] = [];

  // Extract images from the document
  const imageMap: Map<string, string> = new Map();
  const mediaFiles = Object.keys(zip.files).filter(f => f.startsWith("word/media/"));
  
  for (const mediaFile of mediaFiles) {
    const file = zip.file(mediaFile);
    if (file && !file.dir) {
      const imageData = file.asNodeBuffer();
      const base64 = imageData.toString("base64");
      const fileName = mediaFile.split("/").pop() || "";
      imageMap.set(fileName, base64);
    }
  }

  // Parse the document.xml to extract text
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("No document.xml found in DOCX");
  }

  const docXml = docFile.asText();
  
  // Parse relationships to map rId to image files
  const relsFile = zip.file("word/_rels/document.xml.rels");
  const imageRels: Map<string, string> = new Map();
  
  if (relsFile) {
    const relsXml = relsFile.asText();
    const relsData = await parseStringPromise(relsXml);
    const relationships = relsData?.Relationships?.Relationship || [];
    
    for (const rel of relationships) {
      const id = rel.$?.Id;
      const target = rel.$?.Target;
      if (id && target && target.includes("media/")) {
        const fileName = target.split("/").pop();
        imageRels.set(id, fileName);
      }
    }
  }

  // Parse the document XML
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

  // Find image rId in a cell
  const findImageRId = (node: any): string | null => {
    if (!node) return null;
    const nodeStr = JSON.stringify(node);
    const match = nodeStr.match(/"r:embed":"(rId\d+)"/);
    return match ? match[1] : null;
  };

  // Helper to check if text should be skipped (headers, categories, etc.)
  const shouldSkip = (text: string): boolean => {
    if (!text || text.length < 2) return true;
    
    const upper = text.toUpperCase();
    
    // Skip if contains phone number patterns
    if (text.match(/\d{4}\s?\d{3}\s?\d{3}/) || text.match(/\(\d{2}\)\s?\d{4}/)) {
      return true;
    }
    
    // Skip if contains email
    if (text.includes("@") || text.toLowerCase().includes(".com.au")) {
      return true;
    }
    
    // Skip common business words/headers (only if they're the entire string)
    const businessWords = ["ABN", "PTY LTD", "LIMITED", "WAREHOUSE", "PHONE", "EMAIL", "FAX", "ADDRESS", "WWW."];
    if (businessWords.some(word => upper === word || upper === word.replace(/\s/g, ""))) {
      return true;
    }
    
    return false;
  };

  // Create a lookup for column to field mapping
  const columnToField: Record<number, string> = {};
  for (const mapping of columnMappings) {
    columnToField[mapping.column] = mapping.field;
  }

  // Try to find tables in the document
  const body = docData?.["w:document"]?.["w:body"];
  if (!body) {
    throw new Error("No body found in document");
  }

  // Look for tables
  const tables = body["w:tbl"];
  const tableList = tables ? (Array.isArray(tables) ? tables : [tables]) : [];

  for (const table of tableList) {
    const rows = table["w:tr"];
    const rowList = rows ? (Array.isArray(rows) ? rows : [rows]) : [];

    // Start from the specified row (startRow is 1-indexed, array is 0-indexed)
    for (let i = startRow - 1; i < rowList.length; i++) {
      const row = rowList[i];
      const cells = row["w:tc"];
      const cellList = cells ? (Array.isArray(cells) ? cells : [cells]) : [];

      // Create product from this row using column mappings
      const product: Partial<ExtractedProduct> = {};
      
      for (let colIndex = 0; colIndex < cellList.length; colIndex++) {
        const cell = cellList[colIndex];
        const columnNumber = colIndex + 1; // 1-indexed
        const field = columnToField[columnNumber];
        
        if (!field) continue; // No mapping for this column

        if (field === "image") {
          // Extract image from this cell
          const imageRId = findImageRId(cell);
          if (imageRId) {
            const imageFileName = imageRels.get(imageRId);
            if (imageFileName) {
              product.imageBase64 = imageMap.get(imageFileName) || null;
            }
          }
        } else {
          // Extract text from this cell
          const cellText = extractText(cell).trim();
          if (cellText) {
            switch (field) {
              case "code":
                // Clean up the code - remove BWA prefix if present
                let code = cellText;
                if (code.toUpperCase().startsWith("BWA")) {
                  code = code.substring(3).trim();
                  code = code.replace(/^[-\s]+/, "");
                }
                product.code = code;
                break;
              case "description":
                product.description = cellText;
                break;
              case "price":
                // Clean price - remove $ and other characters
                product.price = cellText.replace(/[^0-9.,]/g, "");
                break;
              case "productDetails":
                product.productDetails = cellText;
                break;
              case "brand":
                product.brand = cellText;
                break;
              case "keywords":
                product.keywords = cellText;
                break;
              case "link":
                product.link = cellText;
                break;
              case "area":
                product.area = cellText;
                break;
            }
          }
        }
      }

      // Only add product if it has at least code and description
      if (product.code && product.description && 
          !shouldSkip(product.code) && !shouldSkip(product.description)) {
        products.push({
          code: product.code,
          description: product.description,
          imageBase64: product.imageBase64 || null,
          price: product.price,
          productDetails: product.productDetails,
          brand: product.brand,
          keywords: product.keywords,
          link: product.link,
          area: product.area,
        });
      }
    }
  }

  return products;
}

// Fallback extraction when no supplier is selected (legacy BWA mode)
async function extractFromDocxLegacy(docxBuffer: Buffer): Promise<ExtractedProduct[]> {
  const zip = new PizZip(docxBuffer);
  const products: ExtractedProduct[] = [];

  // Extract images from the document
  const imageMap: Map<string, string> = new Map();
  const mediaFiles = Object.keys(zip.files).filter(f => f.startsWith("word/media/"));
  
  for (const mediaFile of mediaFiles) {
    const file = zip.file(mediaFile);
    if (file && !file.dir) {
      const imageData = file.asNodeBuffer();
      const base64 = imageData.toString("base64");
      const fileName = mediaFile.split("/").pop() || "";
      imageMap.set(fileName, base64);
    }
  }

  // Parse the document.xml to extract text
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("No document.xml found in DOCX");
  }

  const docXml = docFile.asText();
  
  // Parse relationships to map rId to image files
  const relsFile = zip.file("word/_rels/document.xml.rels");
  const imageRels: Map<string, string> = new Map();
  
  if (relsFile) {
    const relsXml = relsFile.asText();
    const relsData = await parseStringPromise(relsXml);
    const relationships = relsData?.Relationships?.Relationship || [];
    
    for (const rel of relationships) {
      const id = rel.$?.Id;
      const target = rel.$?.Target;
      if (id && target && target.includes("media/")) {
        const fileName = target.split("/").pop();
        imageRels.set(id, fileName);
      }
    }
  }

  // Parse the document XML
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

  // Find image rId in a cell
  const findImageRId = (node: any): string | null => {
    if (!node) return null;
    const nodeStr = JSON.stringify(node);
    const match = nodeStr.match(/"r:embed":"(rId\d+)"/);
    return match ? match[1] : null;
  };

  // Helper to check if text should be skipped
  const shouldSkip = (text: string): boolean => {
    if (!text || text.length < 2) return true;
    const upper = text.toUpperCase();
    if (text.match(/\d{4}\s?\d{3}\s?\d{3}/) || text.match(/\(\d{2}\)\s?\d{4}/)) return true;
    if (text.includes("@") || text.toLowerCase().includes(".com.au")) return true;
    const businessWords = ["ABN", "PTY LTD", "LIMITED", "WAREHOUSE", "PHONE", "EMAIL", "FAX", "ADDRESS", "WWW."];
    if (businessWords.some(word => upper === word || upper === word.replace(/\s/g, ""))) return true;
    const categories = ["BASINS", "TAPS", "TOILETS", "SHOWERS", "BATHS", "VANITIES", 
                        "KITCHEN", "BATHROOM", "ACCESSORIES", "MIXERS", "SINKS", "MIXER"];
    if (categories.includes(upper)) return true;
    return false;
  };

  const body = docData?.["w:document"]?.["w:body"];
  if (!body) throw new Error("No body found in document");

  const tables = body["w:tbl"];
  const tableList = tables ? (Array.isArray(tables) ? tables : [tables]) : [];

  for (const table of tableList) {
    const rows = table["w:tr"];
    const rowList = rows ? (Array.isArray(rows) ? rows : [rows]) : [];

    for (let i = 1; i < rowList.length; i++) {
      const row = rowList[i];
      const cells = row["w:tc"];
      const cellList = cells ? (Array.isArray(cells) ? cells : [cells]) : [];

      if (cellList.length >= 2) {
        let code = "";
        let name = "";
        let imageBase64: string | null = null;

        for (const cell of cellList) {
          const cellText = extractText(cell).trim();
          const imageRId = findImageRId(cell);

          if (imageRId && !imageBase64) {
            const imageFileName = imageRels.get(imageRId);
            if (imageFileName) {
              imageBase64 = imageMap.get(imageFileName) || null;
            }
          }

          if (cellText) {
            if (cellText.match(/^BWA/i) || cellText.match(/^[A-Z]{2,}\d+/)) {
              code = cellText;
            } else if (!name && cellText.length > 2) {
              name = cellText;
            }
          }
        }

        if (code.toUpperCase().startsWith("BWA")) {
          code = code.substring(3).trim().replace(/^[-\s]+/, "");
        }

        if (shouldSkip(code) || shouldSkip(name)) continue;

        if (code && name && code.length > 0 && name.length > 2) {
          products.push({ code, description: name, imageBase64 });
        }
      }
    }
  }

  return products;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const supplierId = formData.get("supplierId") as string | null;
    
    if (!file) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 }
      );
    }

    // Get supplier configuration if provided
    let supplier = null;
    if (supplierId) {
      supplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name.toLowerCase();
    
    let docxBuffer: Buffer;
    
    // Check if it's a PDF that needs conversion
    if (fileName.endsWith(".pdf") || file.type === "application/pdf") {
      console.log("Converting PDF to DOCX...");
      docxBuffer = await convertPdfToDocx(buffer);
      console.log("Conversion complete");
    } else if (fileName.endsWith(".docx")) {
      // Already a DOCX
      docxBuffer = buffer;
    } else {
      return NextResponse.json(
        { error: "File must be a PDF or DOCX" },
        { status: 400 }
      );
    }

    // Extract products from DOCX
    console.log("Extracting products from DOCX...");
    let products: ExtractedProduct[];
    
    if (supplier && supplier.columnMappings) {
      // Use supplier's column mappings
      const mappings = supplier.columnMappings as ColumnMapping[];
      products = await extractFromDocx(docxBuffer, mappings, supplier.startRow);
    } else {
      // Fallback to legacy BWA extraction
      products = await extractFromDocxLegacy(docxBuffer);
    }
    
    console.log(`Extracted ${products.length} products`);

    // Convert to the format expected by the frontend
    const rows = products.map((p) => ({
      code: p.code,
      name: p.description,
      description: p.description,
      imageBase64: p.imageBase64,
      price: p.price || "",
      productDetails: p.productDetails || "",
      brand: p.brand || "",
      keywords: p.keywords || "",
      link: p.link || "",
      area: p.area || "",
    }));

    return NextResponse.json({ rows });
  } catch (error: any) {
    console.error("Extract error:", error);
    return NextResponse.json(
      { error: "Failed to extract file", details: error?.message },
      { status: 500 }
    );
  }
}
