import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getPublicUrl, uploadToR2 } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";

    console.log("Product search query:", q);

    const where =
      q.trim().length === 0
        ? {}
        : {
            code: { contains: q, mode: "insensitive" as const },
          };

    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { area: true },
    });

    console.log("Found products:", products.length);

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
    const areaId = formData.get("areaId")?.toString() || "";
    const description = formData.get("description")?.toString() || "";
    const manufacturerDescription =
      formData.get("manufacturerDescription")?.toString() || "";
    const productDetails = formData.get("productDetails")?.toString() || "";
    const priceRaw = formData.get("price")?.toString() || "";
    const image = formData.get("image") as File | null;

    if (!code.trim()) {
      return NextResponse.json(
        { error: "Product code is required." },
        { status: 400 }
      );
    }

    if (!areaId) {
      return NextResponse.json({ error: "Area is required." }, { status: 400 });
    }

    const area = await prisma.area.findUnique({ where: { id: areaId } });
    if (!area) {
      return NextResponse.json({ error: "Area not found." }, { status: 400 });
    }

    if (!description.trim()) {
      return NextResponse.json(
        { error: "Description is required." },
        { status: 400 }
      );
    }

    if (!image) {
      return NextResponse.json(
        { error: "Image is required." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const key = `products/${code}-${Date.now()}-${image.name || "image"}`;

    await uploadToR2({
      key,
      body: buffer,
      contentType: image.type || "application/octet-stream",
    });

    const price = priceRaw ? Number(priceRaw) : null;

    const product = await prisma.product.create({
      data: {
        code,
        areaId: area.id,
        description,
        manufacturerDescription: manufacturerDescription || null,
        productDetails: productDetails || null,
        price: price !== null && !Number.isNaN(price) ? price : null,
        imageUrl: getPublicUrl(key),
      },
      include: { area: true },
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

