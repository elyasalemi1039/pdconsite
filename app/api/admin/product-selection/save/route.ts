import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPublicUrl, uploadToR2 } from "@/lib/r2";
import { NextResponse } from "next/server";

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
  image?: string | null;
  imageUrl?: string | null;
  link?: string | null;
};

function buildProductDetails(p: IncomingProduct) {
  const parts: string[] = [];
  if (p.productDetails?.trim()) parts.push(p.productDetails.trim());
  if (p.areaDescription?.trim()) parts.push(`Area: ${p.areaDescription.trim()}`);
  if (p.quantity?.trim()) parts.push(`Qty: ${p.quantity.trim()}`);
  if (p.notes?.trim()) parts.push(`Notes: ${p.notes.trim()}`);
  return parts.length ? parts.join(" | ") : null;
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

  const { products } = payload ?? {};

  if (!Array.isArray(products) || products.length === 0) {
    return NextResponse.json(
      { error: "At least one product is required" },
      { status: 400 }
    );
  }

  const saved = [];

  try {
    for (const raw of products as IncomingProduct[]) {
      const areaName = (raw?.category || raw?.areaDescription || "Other").trim();
      const code = raw?.code?.trim();
      if (!code) {
        throw new Error("Product code is required for all rows.");
      }

      const area =
        (await prisma.area.findFirst({ where: { name: areaName } })) ||
        (await prisma.area.create({ data: { name: areaName || "Other" } }));

      const description = raw?.description?.trim() || code;
      const productDetails = buildProductDetails(raw);
      const link = raw?.link?.trim() || null;

      const priceNumber = raw?.price ? Number.parseFloat(raw.price) : NaN;
      const price =
        Number.isFinite(priceNumber) && !Number.isNaN(priceNumber)
          ? priceNumber
          : null;

      let imageUrl = raw?.imageUrl?.trim() || "";

      if (raw?.image && raw.image.length > 10) {
        const buffer = Buffer.from(raw.image, "base64");
        const key = `product-sheet/${code}-${Date.now()}.jpg`;
        await uploadToR2({
          key,
          body: buffer,
          contentType: "image/jpeg",
        });
        imageUrl = getPublicUrl(key);
      }

      if (!imageUrl) {
        imageUrl = "https://placehold.co/600x600?text=No+Image";
      }

      const product = await prisma.product.create({
        data: {
          code,
          areaId: area.id,
          description,
          productDetails,
          price,
          imageUrl,
          link,
        },
      });

      saved.push(product);
    }
  } catch (error: any) {
    console.error("Error saving products:", error);
    return NextResponse.json(
      {
        error: "Failed to save products",
        details: error?.message,
        savedCount: saved.length,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ products: saved });
}

