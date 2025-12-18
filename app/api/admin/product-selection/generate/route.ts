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
    
    // Fix URL-encoded placeholders in hyperlinks (Word encodes {{ }} in URLs)
    // Decode %7b%7b and %7d%7d back to {{ and }}
    // Check ALL xml files in the document
    const allFiles = Object.keys(zip.files);
    for (const fileName of allFiles) {
      if (fileName.endsWith(".xml") || fileName.endsWith(".rels")) {
        const file = zip.file(fileName);
        if (file && !file.dir) {
          let xmlContent = file.asText();
          // Decode all URL-encoded curly braces (case insensitive)
          if (xmlContent.includes("%7b") || xmlContent.includes("%7B")) {
            xmlContent = xmlContent
              .replace(/%7b%7b/g, "{{")
              .replace(/%7d%7d/g, "}}")
              .replace(/%7B%7B/g, "{{")
              .replace(/%7D%7D/g, "}}");
            zip.file(fileName, xmlContent);
          }
        }
      }
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: "Template file is corrupted", details: err?.message },
      { status: 500 }
    );
  }

  const hasImages = products.some((p: IncomingProduct) => p?.image || p?.imageUrl);

  const modules = hasImages
    ? [
        new ImageModule({
          centered: false,
          getImage: (value: string) =>
            value ? Buffer.from(value, "base64") : Buffer.alloc(0),
          getSize: () => [132, 113], // Reduced height by ~0.2 inches
        }),
      ]
    : undefined;

  let doc: Docxtemplater;
  try {
    doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{{", end: "}}" },
      ...(modules ? { modules } : {}),
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
    const hasLink = linkTrimmed && linkTrimmed !== "#";
    const linkValue = hasLink ? linkTrimmed : "#";

    productsByCategory[category].push({
      code: raw?.code || "",
      description: raw?.description || "",
      "product-details": raw?.productDetails || "",
      quantity: raw?.quantity || "",
      notes: raw?.notes || "",
      image: images[index] || "",
      link: linkValue,
      linkText: hasLink ? "Product Sheet" : "", // Only show if link exists (no dash, user added it in template)
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

  // Replace #link# placeholders with actual links in the rendered document
  // Collect all links in order (matching the order products were added)
  const allLinks: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    if (productsByCategory[cat]) {
      for (const prod of productsByCategory[cat]) {
        allLinks.push(prod.link || "#");
      }
    }
  }

  // Get the zip and replace #link# in the relationships file (where hyperlink URLs are stored)
  const renderedZip = doc.getZip();
  
  // Hyperlinks are stored in word/_rels/document.xml.rels
  const relsFile = renderedZip.file("word/_rels/document.xml.rels");
  if (relsFile) {
    let relsContent = relsFile.asText();
    let linkIndex = 0;
    // Replace each #link# with the corresponding actual link
    while (relsContent.includes("#link#") && linkIndex < allLinks.length) {
      relsContent = relsContent.replace("#link#", allLinks[linkIndex]);
      linkIndex++;
    }
    renderedZip.file("word/_rels/document.xml.rels", relsContent);
  }
  
  // Also check document.xml in case hyperlinks are inline
  const docFile = renderedZip.file("word/document.xml");
  if (docFile) {
    let docContent = docFile.asText();
    let linkIndex = 0;
    while (docContent.includes("#link#") && linkIndex < allLinks.length) {
      docContent = docContent.replace("#link#", allLinks[linkIndex]);
      linkIndex++;
    }
    renderedZip.file("word/document.xml", docContent);
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

