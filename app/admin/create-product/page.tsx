import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import CreateProductForm from "./product-form";

export default async function CreateProductPage() {
  await requireAdmin();

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Create Product
            </h1>
            <p className="text-sm text-slate-500">
              Add products manually or import from a supplier file
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/product-import">
              <Button className="gap-1 bg-amber-500 hover:bg-amber-600 text-white animate-pulse">
                📥 Import from Supplier
              </Button>
            </Link>
            <Link href="/admin">
              <Button variant="outline">← Back</Button>
            </Link>
          </div>
        </div>

        <CreateProductForm />
      </div>
    </main>
  );
}
