import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/admin/areas/[id] - Update an area
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
        { error: "Area name is required" },
        { status: 400 }
      );
    }

    // Check if area exists
    const existing = await prisma.area.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Area not found" }, { status: 404 });
    }

    // Check if new name already exists (different area)
    const duplicate = await prisma.area.findFirst({
      where: { name, id: { not: id } },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "An area with this name already exists" },
        { status: 400 }
      );
    }

    const area = await prisma.area.update({
      where: { id },
      data: { name },
    });

    return NextResponse.json({ area });
  } catch (error: any) {
    console.error("Error updating area:", error);
    return NextResponse.json(
      { error: "Failed to update area", details: error?.message },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/areas/[id] - Delete an area
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

    // Check if area exists
    const existing = await prisma.area.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Area not found" }, { status: 404 });
    }

    // Check if area has products
    const productCount = await prisma.product.count({
      where: { areaId: id },
    });

    if (productCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${productCount} product(s) are using this area` },
        { status: 400 }
      );
    }

    await prisma.area.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting area:", error);
    return NextResponse.json(
      { error: "Failed to delete area", details: error?.message },
      { status: 500 }
    );
  }
}

