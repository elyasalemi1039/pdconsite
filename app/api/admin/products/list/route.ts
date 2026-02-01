import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "50");

    const skip = (page - 1) * pageSize;

    const products = await prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: { type: true },
    });

    return NextResponse.json({ products });
  } catch (error: any) {
    console.error("Error fetching products:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch products",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}

