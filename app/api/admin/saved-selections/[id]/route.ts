import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET - Fetch a single saved selection
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const selection = await prisma.savedSelection.findUnique({
      where: { id },
    });

    if (!selection) {
      return NextResponse.json({ error: "Selection not found" }, { status: 404 });
    }

    return NextResponse.json({ selection });
  } catch (error: unknown) {
    console.error("Error fetching selection:", error);
    return NextResponse.json(
      { error: "Failed to fetch selection" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a saved selection
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await prisma.savedSelection.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error deleting selection:", error);
    return NextResponse.json(
      { error: "Failed to delete selection" },
      { status: 500 }
    );
  }
}

