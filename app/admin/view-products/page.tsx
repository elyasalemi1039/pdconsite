import Image from "next/image";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const revalidate = 0;

export default async function ViewProductsPage() {
  await requireAdmin();

  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { area: true },
  });

  return (
    <main className="min-h-screen bg-slate-50 py-16 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Admin</p>
            <h1 className="text-2xl font-semibold text-slate-900">
              View Products
            </h1>
            <p className="text-sm text-slate-500">
              Latest 100 products stored in the system.
            </p>
          </div>
          <Button asChild variant="outline">
            <a href="/admin">Back to Admin</a>
          </Button>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <th className="p-3">Code</th>
                <th className="p-3">Image</th>
                <th className="p-3">Description</th>
                <th className="p-3">Brand</th>
                <th className="p-3">Area</th>
                <th className="p-3">Keywords</th>
                <th className="p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p: typeof products[number]) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="p-3 font-semibold">
                    {p.code}
                  </td>
                  <td className="p-3">
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt={p.description}
                        className="h-14 w-20 object-cover rounded border border-slate-200"
                      />
                    ) : (
                      <div className="h-14 w-20 bg-slate-100 border border-slate-200 rounded" />
                    )}
                  </td>
                  <td className="p-3">{p.description}</td>
                  <td className="p-3">{p.brand || "—"}</td>
                  <td className="p-3">{p.area?.name || "—"}</td>
                  <td className="p-3 text-xs max-w-[150px] truncate">{p.keywords || "—"}</td>
                  <td className="p-3 text-xs text-slate-500">
                    {p.createdAt.toISOString().slice(0, 10)}
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="p-4 text-sm text-slate-500 text-center"
                  >
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

