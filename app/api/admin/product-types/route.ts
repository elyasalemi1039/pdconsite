import { NextResponse } from "next/server";

import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const productTypes = await prisma.productType.findMany({
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ productTypes });
  } catch (error: any) {
    console.error("Error fetching product types:", error);
    return NextResponse.json(
      { error: "Failed to fetch product types", details: error?.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body?.name?.toString().trim();
  if (!name) {
    return NextResponse.json(
      { error: "Product type name is required" },
      { status: 400 }
    );
  }

  try {
    const existing = await prisma.productType.findUnique({ where: { name } });
    if (existing) {
      return NextResponse.json(
        { error: "Product type already exists" },
        { status: 400 }
      );
    }

    const productType = await prisma.productType.create({ data: { name } });
    return NextResponse.json({ productType });
  } catch (error: any) {
    console.error("Error creating product type:", error);
    return NextResponse.json(
      { error: "Failed to create product type", details: error?.message },
      { status: 500 }
    );
  }
}

