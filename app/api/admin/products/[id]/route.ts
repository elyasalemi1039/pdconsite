import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { code, description, productDetails, link, brand, keywords, typeId } = body;

    // Check if product exists
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // If code is being changed, check for duplicates
    if (code && code !== existing.code) {
      const duplicate = await prisma.product.findUnique({ where: { code } });
      if (duplicate) {
        return NextResponse.json(
          { error: "Product with this code already exists" },
          { status: 400 }
        );
      }
    }

    // Update product
    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(code && { code }),
        ...(description && { description }),
        ...(productDetails !== undefined && { productDetails }),
        ...(link !== undefined && { link: link || null }),
        ...(brand !== undefined && { brand: brand || null }),
        ...(keywords !== undefined && { keywords: keywords || null }),
        ...(typeId && { typeId }),
      },
      include: { type: true },
    });

    return NextResponse.json({ product });
  } catch (error: any) {
    console.error("Error updating product:", error);
    return NextResponse.json(
      {
        error: "Failed to update product",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if product exists
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Delete product
    await prisma.product.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting product:", error);
    return NextResponse.json(
      {
        error: "Failed to delete product",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}

