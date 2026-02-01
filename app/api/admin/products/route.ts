import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getPublicUrl, uploadToR2 } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";
    const all = searchParams.get("all") === "true";

    // If all=true, return all products for client-side filtering
    if (all) {
      const products = await prisma.product.findMany({
        orderBy: { createdAt: "desc" },
        include: { type: true },
      });
      return NextResponse.json({ products });
    }

    // Search by code, brand, or keywords
    const where =
      q.trim().length === 0
        ? {}
        : {
            OR: [
              { code: { contains: q, mode: "insensitive" as const } },
              { brand: { contains: q, mode: "insensitive" as const } },
              { keywords: { contains: q, mode: "insensitive" as const } },
            ],
          };

    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { type: true },
    });
    
    return NextResponse.json({ products });
  } catch (error) {
    console.error("Error fetching products:", error);
    const errorMessage =
      error instanceof Error ? `${error.message}` : "Unknown error";
    
    return NextResponse.json(
      { error: "Failed to fetch products", details: errorMessage, products: [] },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const code = formData.get("code")?.toString() || "";
    const typeId = formData.get("typeId")?.toString() || "";
    const description = formData.get("description")?.toString() || "";
    const productDetails = formData.get("productDetails")?.toString() || "";
    const link = formData.get("link")?.toString() || "";
    const brand = formData.get("brand")?.toString() || "";
    const keywords = formData.get("keywords")?.toString() || "";
    const image = formData.get("image") as File | null;

    if (!code.trim()) {
      return NextResponse.json(
        { error: "Product code is required." },
        { status: 400 }
      );
    }

    if (!typeId) {
      return NextResponse.json({ error: "Product type is required." }, { status: 400 });
    }

    const productType = await prisma.productType.findUnique({ where: { id: typeId } });
    if (!productType) {
      return NextResponse.json({ error: "Product type not found." }, { status: 400 });
    }

    if (!description.trim()) {
      return NextResponse.json(
        { error: "Description is required." },
        { status: 400 }
      );
    }

    let imageUrl = "/no-image.png"; // Default placeholder

    if (image && image.size > 0) {
      const buffer = Buffer.from(await image.arrayBuffer());
      const key = `products/${code}-${Date.now()}-${image.name || "image"}`;

      await uploadToR2({
        key,
        body: buffer,
        contentType: image.type || "application/octet-stream",
      });

      imageUrl = getPublicUrl(key);
    }

    const product = await prisma.product.create({
      data: {
        code,
        typeId: productType.id,
        description,
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
