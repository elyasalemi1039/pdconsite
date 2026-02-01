import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";

// Available fields that can be mapped to columns
export const MAPPABLE_FIELDS = [
  { value: "code", label: "Product Code" },
  { value: "description", label: "Description/Name" },
  { value: "image", label: "Image" },
  { value: "price", label: "Price" },
  { value: "productDetails", label: "Product Details" },
  { value: "brand", label: "Brand" },
  { value: "keywords", label: "Keywords" },
  { value: "link", label: "Link/URL" },
  { value: "area", label: "Area/Category" },
  { value: "skip", label: "Skip (Ignore)" },
] as const;

export type MappableField = typeof MAPPABLE_FIELDS[number]["value"];

export type ColumnMapping = {
  column: number; // 1-based column index
  field: MappableField;
};

// GET /api/admin/suppliers - List all suppliers
export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ suppliers });
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    return NextResponse.json(
      { error: "Failed to fetch suppliers" },
      { status: 500 }
    );
  }
}

// POST /api/admin/suppliers - Create a new supplier
export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, columnMappings, startRow, hasHeaderRow } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Supplier name is required" },
        { status: 400 }
      );
    }

    if (!columnMappings || !Array.isArray(columnMappings)) {
      return NextResponse.json(
        { error: "Column mappings are required" },
        { status: 400 }
      );
    }

    // Validate mappings
    const hasCode = columnMappings.some((m: ColumnMapping) => m.field === "code");
    const hasDescription = columnMappings.some((m: ColumnMapping) => m.field === "description");
    
    if (!hasCode || !hasDescription) {
      return NextResponse.json(
        { error: "At minimum, Product Code and Description columns must be mapped" },
        { status: 400 }
      );
    }

    const supplier = await prisma.supplier.create({
      data: {
        name: name.trim(),
        columnMappings: columnMappings,
        startRow: startRow || 2,
        hasHeaderRow: hasHeaderRow !== false,
      },
    });

    return NextResponse.json({ supplier }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating supplier:", error);
    
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "A supplier with this name already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create supplier" },
      { status: 500 }
    );
  }
}

