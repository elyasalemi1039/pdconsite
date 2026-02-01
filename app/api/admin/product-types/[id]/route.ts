import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/admin/product-types/[id] - Update a product type
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const name = body?.name?.toString().trim();

    if (!name) {
      return NextResponse.json(
        { error: "Product type name is required" },
        { status: 400 }
      );
    }

    // Check if product type exists
    const existing = await prisma.productType.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Product type not found" }, { status: 404 });
    }

    // Check if new name already exists (different product type)
    const duplicate = await prisma.productType.findFirst({
      where: { name, id: { not: id } },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "A product type with this name already exists" },
        { status: 400 }
      );
    }

    const productType = await prisma.productType.update({
      where: { id },
      data: { name },
    });

    return NextResponse.json({ productType });
  } catch (error: any) {
    console.error("Error updating product type:", error);
    return NextResponse.json(
      { error: "Failed to update product type", details: error?.message },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/product-types/[id] - Delete a product type
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Check if product type exists
    const existing = await prisma.productType.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Product type not found" }, { status: 404 });
    }

    // Check if product type has products
    const productCount = await prisma.product.count({
      where: { typeId: id },
    });

    if (productCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${productCount} product(s) are using this type` },
        { status: 400 }
      );
    }

    await prisma.productType.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting product type:", error);
    return NextResponse.json(
      { error: "Failed to delete product type", details: error?.message },
      { status: 500 }
    );
  }
}

