import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET - List all saved selections
export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const selections = await prisma.savedSelection.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ selections });
  } catch (error: unknown) {
    console.error("Error fetching saved selections:", error);
    return NextResponse.json(
      { error: "Failed to fetch saved selections" },
      { status: 500 }
    );
  }
}

// POST - Create or update a saved selection
export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: {
    id?: string;
    name?: string;
    address: string;
    date: string;
    contactName?: string;
    company?: string;
    phoneNumber?: string;
    email?: string;
    products: Array<{
      id: string;
      code: string;
      areaName: string;
      description: string;
      productDetails: string | null;
      imageUrl: string;
      quantity: string;
      notes: string;
      link: string | null;
    }>;
    status?: string;
  };

  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, name, address, date, contactName, company, phoneNumber, email, products, status } = payload;

  if (!address?.trim()) {
    return NextResponse.json({ error: "Address is required" }, { status: 400 });
  }

  // Generate a name if not provided
  const selectionName = name?.trim() || `${address.trim()} - ${new Date(date || Date.now()).toLocaleDateString()}`;

  try {
    let selection;

    if (id) {
      // Update existing selection
      selection = await prisma.savedSelection.update({
        where: { id },
        data: {
          name: selectionName,
          address: address.trim(),
          date: date || new Date().toISOString().split("T")[0],
          contactName: contactName?.trim() || null,
          company: company?.trim() || null,
          phoneNumber: phoneNumber?.trim() || null,
          email: email?.trim() || null,
          products: products || [],
          status: status || "draft",
        },
      });
    } else {
      // Create new selection
      selection = await prisma.savedSelection.create({
        data: {
          name: selectionName,
          address: address.trim(),
          date: date || new Date().toISOString().split("T")[0],
          contactName: contactName?.trim() || null,
          company: company?.trim() || null,
          phoneNumber: phoneNumber?.trim() || null,
          email: email?.trim() || null,
          products: products || [],
          status: status || "draft",
        },
      });
    }

    return NextResponse.json({ selection });
  } catch (error: unknown) {
    console.error("Error saving selection:", error);
    return NextResponse.json(
      { error: "Failed to save selection", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

