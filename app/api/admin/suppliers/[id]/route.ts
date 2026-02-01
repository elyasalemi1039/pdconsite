import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import type { ColumnMapping } from "../route";

// GET /api/admin/suppliers/[id] - Get a single supplier
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    
    const supplier = await prisma.supplier.findUnique({
      where: { id },
    });

    if (!supplier) {
      return NextResponse.json(
        { error: "Supplier not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ supplier });
  } catch (error) {
    console.error("Error fetching supplier:", error);
    return NextResponse.json(
      { error: "Failed to fetch supplier" },
      { status: 500 }
    );
  }
}

// PUT /api/admin/suppliers/[id] - Update a supplier
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
    const { name, columnMappings, startRow, hasHeaderRow } = body;

    // Check supplier exists
    const existing = await prisma.supplier.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Supplier not found" },
        { status: 404 }
      );
    }

    // Validate if mappings provided
    if (columnMappings) {
      const hasCode = columnMappings.some((m: ColumnMapping) => m.field === "code");
      const hasDescription = columnMappings.some((m: ColumnMapping) => m.field === "description");
      
      if (!hasCode || !hasDescription) {
        return NextResponse.json(
          { error: "At minimum, Product Code and Description columns must be mapped" },
          { status: 400 }
        );
      }
    }

    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(columnMappings && { columnMappings }),
        ...(startRow !== undefined && { startRow }),
        ...(hasHeaderRow !== undefined && { hasHeaderRow }),
      },
    });

    return NextResponse.json({ supplier });
  } catch (error: any) {
    console.error("Error updating supplier:", error);
    
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "A supplier with this name already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update supplier" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/suppliers/[id] - Delete a supplier
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

    await prisma.supplier.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting supplier:", error);
    
    if (error.code === "P2025") {
      return NextResponse.json(
        { error: "Supplier not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to delete supplier" },
      { status: 500 }
    );
  }
}

