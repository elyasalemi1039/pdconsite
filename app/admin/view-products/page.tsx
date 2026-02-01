"use client";

import { useEffect, useState } from "react";
import toast, { Toaster } from "react-hot-toast";

type ProductType = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  code: string;
  description: string;
  productDetails: string | null;
  imageUrl: string;
  link: string | null;
  brand: string | null;
  keywords: string | null;
  typeId: string;
  type: ProductType;
  createdAt: string;
};

export default function ViewProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [saving, setSaving] = useState(false);

  const pageSize = 50;

  useEffect(() => {
    loadProductTypes();
    loadProducts();
  }, [page]);

  const loadProductTypes = async () => {
    try {
      const res = await fetch("/api/admin/product-types");
      const data = await res.json();
      if (data.productTypes) {
        setProductTypes(data.productTypes);
      }
    } catch (error) {
      toast.error("Failed to load product types");
    }
  };

  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/products/list?page=${page}&pageSize=${pageSize}`);
      const data = await res.json();
      
      if (data.products) {
        setProducts((prev) => (page === 1 ? data.products : [...prev, ...data.products]));
        setHasMore(data.products.length === pageSize);
      }
    } catch (error) {
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (product: Product) => {
    setEditingId(product.id);
    setEditForm(product);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveProduct = async () => {
    if (!editingId) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/products/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: editForm.code,
          description: editForm.description,
          productDetails: editForm.productDetails,
          link: editForm.link,
          brand: editForm.brand,
          keywords: editForm.keywords,
          typeId: editForm.typeId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to save product");
        return;
      }

      const data = await res.json();
      setProducts((prev) =>
        prev.map((p) => (p.id === editingId ? { ...p, ...data.product } : p))
      );
      toast.success("Product updated");
      cancelEditing();
    } catch (error) {
      toast.error("Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (id: string, code: string) => {
    if (!confirm(`Delete product ${code}?`)) return;

    try {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to delete product");
        return;
      }

      setProducts((prev) => prev.filter((p) => p.id !== id));
      toast.success("Product deleted");
    } catch (error) {
      toast.error("Failed to delete product");
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 py-16 px-4">
      <Toaster />
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Admin</p>
            <h1 className="text-2xl font-semibold text-slate-900">View Products</h1>
            <p className="text-sm text-slate-500">
              {products.length} products loaded{hasMore ? ", scroll to load more" : ""}.
            </p>
          </div>
          <a
            href="/admin"
            className="px-4 py-2 text-sm border border-slate-300 rounded hover:bg-white"
          >
            Back to Admin
          </a>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <th className="p-3">Code</th>
                <th className="p-3">Image</th>
                <th className="p-3">Description</th>
                <th className="p-3">Brand</th>
                <th className="p-3">Type</th>
                <th className="p-3">Keywords</th>
                <th className="p-3">Created</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const isEditing = editingId === p.id;
                return (
                  <tr key={p.id} className="border-t border-slate-100">
                    {isEditing ? (
                      <>
                        <td className="p-3">
                          <input
                            type="text"
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={editForm.code || ""}
                            onChange={(e) =>
                              setEditForm({ ...editForm, code: e.target.value.toUpperCase() })
                            }
                          />
                        </td>
                        <td className="p-3">
                          <img
                            src={p.imageUrl || "/no-image.png"}
                            alt={p.description}
                            className="h-14 w-20 object-cover rounded border border-slate-200"
                          />
                        </td>
                        <td className="p-3">
                          <textarea
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={editForm.description || ""}
                            onChange={(e) =>
                              setEditForm({ ...editForm, description: e.target.value })
                            }
                            rows={2}
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={editForm.brand || ""}
                            onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                          />
                        </td>
                        <td className="p-3">
                          <select
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm bg-white"
                            value={editForm.typeId || ""}
                            onChange={(e) =>
                              setEditForm({ ...editForm, typeId: e.target.value })
                            }
                          >
                            {productTypes.map((type) => (
                              <option key={type.id} value={type.id}>
                                {type.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            value={editForm.keywords || ""}
                            onChange={(e) =>
                              setEditForm({ ...editForm, keywords: e.target.value })
                            }
                          />
                        </td>
                        <td className="p-3 text-xs text-slate-500">
                          {new Date(p.createdAt).toISOString().slice(0, 10)}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <button
                              onClick={saveProduct}
                              disabled={saving}
                              className="text-xs text-green-600 hover:underline disabled:opacity-50"
                            >
                              {saving ? "Saving..." : "Save"}
                            </button>
                            <button
                              onClick={cancelEditing}
                              disabled={saving}
                              className="text-xs text-slate-600 hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-3 font-semibold">{p.code}</td>
                        <td className="p-3">
                          <img
                            src={p.imageUrl || "/no-image.png"}
                            alt={p.description}
                            className="h-14 w-20 object-cover rounded border border-slate-200"
                          />
                        </td>
                        <td className="p-3">{p.description}</td>
                        <td className="p-3">{p.brand || "—"}</td>
                        <td className="p-3">{p.type?.name || "—"}</td>
                        <td className="p-3 text-xs max-w-[150px] truncate">
                          {p.keywords || "—"}
                        </td>
                        <td className="p-3 text-xs text-slate-500">
                          {new Date(p.createdAt).toISOString().slice(0, 10)}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => startEditing(p)}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteProduct(p.id, p.code)}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
              {products.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="p-4 text-sm text-slate-500 text-center">
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {hasMore && !loading && (
          <div className="text-center">
            <button
              onClick={() => setPage((p) => p + 1)}
              className="px-4 py-2 text-sm bg-amber-500 text-white rounded hover:bg-amber-600"
            >
              Load More
            </button>
          </div>
        )}

        {loading && (
          <div className="text-center text-sm text-slate-500">Loading products...</div>
        )}
      </div>
    </main>
  );
}
