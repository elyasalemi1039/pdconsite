import { NextResponse } from "next/server";
import PizZip from "pizzip";
import { parseStringPromise } from "xml2js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExtractedProduct = {
  code: string;
  name: string;
  imageBase64: string | null;
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

async function extractFromDocx(docxBuffer: Buffer): Promise<ExtractedProduct[]> {
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

    // Skip header row
    for (let i = 1; i < rowList.length; i++) {
      const row = rowList[i];
      const cells = row["w:tc"];
      const cellList = cells ? (Array.isArray(cells) ? cells : [cells]) : [];

      if (cellList.length >= 2) {
        // Try to extract data from cells
        // Typically: Image | Code | Name or Code | Name | Image
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
            // Check if this looks like a product code (starts with BWA or has specific pattern)
            if (cellText.match(/^BWA/i) || cellText.match(/^[A-Z]{2,}\d+/)) {
              code = cellText;
            } else if (!name && cellText.length > 2) {
              name = cellText;
            }
          }
        }

        // Remove "BWA" prefix from code if present
        if (code.toUpperCase().startsWith("BWA")) {
          code = code.substring(3).trim();
          // Also remove leading dash or space
          code = code.replace(/^[-\s]+/, "");
        }

        if (code || name) {
          products.push({
            code: code || name.substring(0, 10).toUpperCase(),
            name: name || code,
            imageBase64,
          });
        }
      }
    }
  }

  // If no tables found, try to extract from paragraphs
  if (products.length === 0) {
    const paragraphs = body["w:p"];
    const paraList = paragraphs ? (Array.isArray(paragraphs) ? paragraphs : [paragraphs]) : [];
    
    let currentProduct: Partial<ExtractedProduct> = {};
    
    for (const para of paraList) {
      const text = extractText(para).trim();
      const imageRId = findImageRId(para);
      
      if (imageRId) {
        const imageFileName = imageRels.get(imageRId);
        if (imageFileName) {
          currentProduct.imageBase64 = imageMap.get(imageFileName) || null;
        }
      }
      
      if (text) {
        // Check if this looks like a product code
        if (text.match(/^BWA/i) || text.match(/^[A-Z]{2,}\d+/)) {
          // Save previous product if exists
          if (currentProduct.code || currentProduct.name) {
            let code = currentProduct.code || "";
            if (code.toUpperCase().startsWith("BWA")) {
              code = code.substring(3).replace(/^[-\s]+/, "");
            }
            products.push({
              code,
              name: currentProduct.name || code,
              imageBase64: currentProduct.imageBase64 || null,
            });
          }
          
          // Start new product
          let code = text;
          if (code.toUpperCase().startsWith("BWA")) {
            code = code.substring(3).replace(/^[-\s]+/, "");
          }
          currentProduct = { code };
        } else if (text.length > 3 && !currentProduct.name) {
          currentProduct.name = text;
        }
      }
    }
    
    // Don't forget the last product
    if (currentProduct.code || currentProduct.name) {
      let code = currentProduct.code || "";
      if (code.toUpperCase().startsWith("BWA")) {
        code = code.substring(3).replace(/^[-\s]+/, "");
      }
      products.push({
        code,
        name: currentProduct.name || code,
        imageBase64: currentProduct.imageBase64 || null,
      });
    }
  }

  return products;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    
    if (!file) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 }
      );
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
    const products = await extractFromDocx(docxBuffer);
    console.log(`Extracted ${products.length} products`);

    // Convert to the format expected by the frontend
    const rows = products.map((p) => ({
      code: p.code,
      name: p.name,
      imageBase64: p.imageBase64,
    }));

    return NextResponse.json({ rows });
  } catch (error: any) {
    console.error("BWA extract error:", error);
    return NextResponse.json(
      { error: "Failed to extract file", details: error?.message },
      { status: 500 }
    );
  }
}
