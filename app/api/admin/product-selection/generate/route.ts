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
  areaDescription?: string;
  quantity?: string;
  price?: string;
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

const PLACEHOLDER_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="; // 1x1 png

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

  const hasImages = products.some((p: IncomingProduct) => p?.image || p?.imageUrl);

  const modules = hasImages
    ? [
        new ImageModule({
          centered: false,
          getImage: (value: string) =>
            value ? Buffer.from(value, "base64") : Buffer.alloc(0),
          getSize: () => [132, 132],
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

  const fetchImageAsBase64 = async (url?: string | null) => {
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

  for (const raw of products as IncomingProduct[]) {
    const category = raw?.category || "Other";
    if (!productsByCategory[category]) productsByCategory[category] = [];

    const base64 =
      raw?.image && raw.image.length > 10
        ? raw.image
        : await fetchImageAsBase64(raw?.imageUrl) || PLACEHOLDER_BASE64;

    productsByCategory[category].push({
      code: raw?.code || "",
      description: raw?.description || "",
      "product-details": raw?.productDetails || "",
      "area-description": raw?.areaDescription || "",
      quantity: raw?.quantity || "",
      price: raw?.price || "",
      notes: raw?.notes || "",
      image: base64 || "",
      link: raw?.link || "",
    });
  }

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

  const buffer = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  const safeAddress = address.replace(/[^a-z0-9_-]+/gi, "_");

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="Product_Selection_${safeAddress}.docx"`,
    },
  });
}

