import { getSessionFromCookies } from "@/lib/auth";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import { NextResponse } from "next/server";
import PizZip from "pizzip";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IncomingProduct = {
  category?: string;
  code?: string;
  description?: string;
  productDetails?: string;
  quantity?: string;
  notes?: string;
  image?: string | null; // base64
  imageUrl?: string | null; // public URL to fetch
  link?: string | null; // product link for hyperlink
};

const CATEGORY_ORDER = [
  "Kitchen",
  "Bathroom",
  "Bedroom",
  "Living Room",
  "Laundry",
  "Balcony",
  "Other",
];

// Will be loaded from /public/no-image.png
let PLACEHOLDER_BASE64: string = "";

function formatDate(input?: string) {
  const parsed = input ? new Date(input) : new Date();
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    address,
    date,
    contactName,
    company,
    phoneNumber,
    email,
    products,
    format = "pdf", // Default to PDF
  } = payload ?? {};

  if (!address || typeof address !== "string" || !address.trim()) {
    return NextResponse.json({ error: "Address is required" }, { status: 400 });
  }

  if (!Array.isArray(products) || products.length === 0) {
    return NextResponse.json(
      { error: "At least one product is required" },
      { status: 400 }
    );
  }

  const templatePath = path.join(process.cwd(), "public", "product-selection.docx");
  if (!fs.existsSync(templatePath)) {
    return NextResponse.json(
      { error: "Template file not found" },
      { status: 500 }
    );
  }

  // Load placeholder image
  const placeholderPath = path.join(process.cwd(), "public", "no-image.png");
  if (fs.existsSync(placeholderPath)) {
    PLACEHOLDER_BASE64 = fs.readFileSync(placeholderPath).toString("base64");
  }

  const content = fs.readFileSync(templatePath, "binary");

  let zip: PizZip;
  try {
    zip = new PizZip(content);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Template file is corrupted", details: err?.message },
      { status: 500 }
    );
  }

  // Always load ImageModule (needed for placeholder images too)
  const imageModule = new ImageModule({
    centered: false,
    getImage: (value: string) => {
      if (!value || value.length < 10) {
        // Return placeholder if no valid image
        return PLACEHOLDER_BASE64 ? Buffer.from(PLACEHOLDER_BASE64, "base64") : Buffer.alloc(0);
      }
      return Buffer.from(value, "base64");
    },
    getSize: () => [132, 113],
  });

  let doc: Docxtemplater;
  try {
    doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{{", end: "}}" },
      modules: [imageModule],
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Template structure invalid", details: err?.message },
      { status: 500 }
    );
  }

  const productsByCategory: Record<string, any[]> = {};

  const fetchImageAsBase64 = async (url?: string | null): Promise<string> => {
    if (!url) return "";
    try {
      const resp = await fetch(url);
      if (!resp.ok) return "";
      const arrayBuffer = await resp.arrayBuffer();
      return Buffer.from(arrayBuffer).toString("base64");
    } catch {
      return "";
    }
  };

  // Fetch all images in PARALLEL for speed
  const productList = products as IncomingProduct[];
  const imagePromises = productList.map(async (raw) => {
    if (raw?.image && raw.image.length > 10) {
      return raw.image;
    }
    return await fetchImageAsBase64(raw?.imageUrl) || PLACEHOLDER_BASE64;
  });
  const images = await Promise.all(imagePromises);

  // Build products with pre-fetched images
  productList.forEach((raw, index) => {
    const category = raw?.category || "Other";
    if (!productsByCategory[category]) productsByCategory[category] = [];

    // Check if there's a valid link
    const linkTrimmed = raw?.link?.trim() || "";
    const hasLink = linkTrimmed && linkTrimmed !== "#" && linkTrimmed.length > 0;

    productsByCategory[category].push({
      code: raw?.code || "",
      description: raw?.description || "",
      "product-details": raw?.productDetails || "",
      quantity: raw?.quantity || "",
      notes: raw?.notes || "",
      image: images[index] || "",
      link: hasLink ? linkTrimmed : "",
      // Use markers so we can find and convert to hyperlinks after rendering
      linkText: hasLink ? `HYPERLINKSTART${linkTrimmed}HYPERLINKMIDProduct SheetHYPERLINKEND` : "",
    });
  });

  const categories = CATEGORY_ORDER.filter(
    (cat) => productsByCategory[cat]?.length > 0
  ).map((cat) => ({
    "category-name": cat.toUpperCase(),
    products: productsByCategory[cat],
  }));

  doc.setData({
    address: address.trim(),
    date: formatDate(date),
    "contact-name": contactName || "",
    company: company || "",
    "phone-number": phoneNumber || "",
    email: email || "",
    categories,
  });

  try {
    doc.render();
  } catch (err: any) {
    const details =
      err?.properties?.errors
        ?.map((e: any) => `${e.name}: ${e.message}`)
        .join("; ") || err?.message;

    return NextResponse.json(
      { error: "Template rendering failed", details },
      { status: 500 }
    );
  }

  // Get the rendered zip
  const renderedZip = doc.getZip();
  
  // Convert HYPERLINK markers to actual Word hyperlinks
  const docFile = renderedZip.file("word/document.xml");
  const relsFile = renderedZip.file("word/_rels/document.xml.rels");
  
  if (docFile && relsFile) {
    let docContent = docFile.asText();
    let relsContent = relsFile.asText();
    
    // Find the highest existing rId
    const rIdMatches = relsContent.match(/Id="rId(\d+)"/g) || [];
    let maxRId = 0;
    for (const match of rIdMatches) {
      const num = parseInt(match.match(/rId(\d+)/)?.[1] || "0");
      if (num > maxRId) maxRId = num;
    }
    
    // Find all hyperlink markers and replace them
    const hyperlinkPattern = /HYPERLINKSTART(.+?)HYPERLINKMIDProduct SheetHYPERLINKEND/g;
    let match;
    const hyperlinksToAdd: { url: string; rId: string }[] = [];
    
    // First pass: collect all hyperlinks and assign rIds
    const tempContent = docContent;
    while ((match = hyperlinkPattern.exec(tempContent)) !== null) {
      maxRId++;
      hyperlinksToAdd.push({ url: match[1], rId: `rId${maxRId}` });
    }
    
    // Second pass: replace markers with hyperlink XML
    let linkIndex = 0;
    docContent = docContent.replace(hyperlinkPattern, () => {
      if (linkIndex < hyperlinksToAdd.length) {
        const { rId } = hyperlinksToAdd[linkIndex];
        linkIndex++;
        // Return the hyperlink XML - we wrap "Product Sheet" in a hyperlink
        return `</w:t></w:r><w:hyperlink r:id="${rId}"><w:r><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr><w:t>Product Sheet</w:t></w:r></w:hyperlink><w:r><w:t>`;
      }
      return "Product Sheet";
    });
    
    // Add hyperlink relationships to .rels file
    if (hyperlinksToAdd.length > 0) {
      // Insert before </Relationships>
      const newRels = hyperlinksToAdd
        .map(h => `<Relationship Id="${h.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${h.url}" TargetMode="External"/>`)
        .join("");
      relsContent = relsContent.replace("</Relationships>", newRels + "</Relationships>");
    }
    
    renderedZip.file("word/document.xml", docContent);
    renderedZip.file("word/_rels/document.xml.rels", relsContent);
  }

  const docxBuffer = renderedZip.generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  // Generate filename: ProductSelection + first letter of each word + date (DDMMYYYY)
  const addressInitials = address
    .trim()
    .split(/\s+/)
    .map((word: string) => word.charAt(0).toUpperCase())
    .filter((char: string) => /[A-Z]/.test(char)) // Only letters
    .join("");
  
  // Format date as DDMMYYYY
  const dateObj = date ? new Date(date) : new Date();
  const dd = String(dateObj.getDate()).padStart(2, "0");
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const yyyy = dateObj.getFullYear();
  const formattedDate = `${dd}${mm}${yyyy}`;
  
  const fileName = `ProductSelection${addressInitials}${formattedDate}`;

  // If Word format requested, return docx directly
  if (format === "docx") {
    return new NextResponse(docxBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}.docx"`,
      },
    });
  }

  // For PDF, use CloudConvert API
  try {
    const CloudConvert = (await import("cloudconvert")).default;
    const cloudConvert = new CloudConvert(process.env.CLOUDCONVERT_API_KEY!);

    // Create a job that uploads, converts, and exports
    const job = await cloudConvert.jobs.create({
      tasks: {
        "upload-docx": {
          operation: "import/upload",
        },
        "convert-to-pdf": {
          operation: "convert",
          input: "upload-docx",
          output_format: "pdf",
        },
        "export-pdf": {
          operation: "export/url",
          input: "convert-to-pdf",
        },
      },
    });

    // Find the upload task and upload the docx
    const uploadTask = job.tasks.find((t: any) => t.name === "upload-docx");
    if (!uploadTask) {
      throw new Error("Upload task not found");
    }

    await cloudConvert.tasks.upload(uploadTask, docxBuffer, "document.docx");

    // Wait for the job to complete
    const completedJob = await cloudConvert.jobs.wait(job.id);

    // Find the export task and get the file URL
    const exportTask = completedJob.tasks.find((t: any) => t.name === "export-pdf");
    if (!exportTask?.result?.files?.[0]?.url) {
      throw new Error("Export task failed or no file URL");
    }

    // Download the PDF
    const pdfUrl = exportTask.result.files[0].url;
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      throw new Error("Failed to download converted PDF");
    }

    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("PDF conversion failed:", err?.message);
    return NextResponse.json(
      { 
        error: "PDF conversion failed", 
        details: err?.message || "Unknown error during PDF conversion. Try downloading as Word instead.",
      },
      { status: 500 }
    );
  }
}

