import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getPublicUrl, uploadToR2 } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const code = formData.get("code")?.toString() || "";
    const description = formData.get("description")?.toString() || "";
    const productDetails = formData.get("productDetails")?.toString() || "";
    const link = formData.get("link")?.toString() || "";
    const brand = formData.get("brand")?.toString() || "";
    const keywords = formData.get("keywords")?.toString() || "";
    const typeName = formData.get("typeName")?.toString() || "Other";
    const image = formData.get("image") as File | null;

    if (!code.trim()) {
      return NextResponse.json(
        { error: "Product code is required." },
        { status: 400 }
      );
    }

    // Find or create the product type
    let productType = await prisma.productType.findFirst({ where: { name: typeName } });
    if (!productType) {
      productType = await prisma.productType.create({ data: { name: typeName } });
    }

    // Handle image upload
    let imageUrl = "/no-image.png";
    
    if (image && image.size > 0) {
      const buffer = Buffer.from(await image.arrayBuffer());
      const key = `products/bwa-${code}-${Date.now()}-${image.name || "image.png"}`;

      await uploadToR2({
        key,
        body: buffer,
        contentType: image.type || "image/png",
      });

      imageUrl = getPublicUrl(key);
    }

    // Check if product with this code already exists
    const existing = await prisma.product.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json(
        { error: `Product with code ${code} already exists.` },
        { status: 400 }
      );
    }

    const product = await prisma.product.create({
      data: {
        code,
        typeId: productType.id,
        description: description || code,
        productDetails: productDetails || null,
        imageUrl,
        link: link || null,
        brand: brand || null,
        keywords: keywords || null,
      },
      include: { type: true },
    });

    return NextResponse.json({ product });
  } catch (error: any) {
    console.error("Error creating product:", error);
    return NextResponse.json(
      {
        error: "Failed to create product",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
