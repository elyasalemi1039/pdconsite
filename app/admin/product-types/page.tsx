"use client";

import { useEffect, useState } from "react";
import toast, { Toaster } from "react-hot-toast";

type ProductType = { id: string; name: string };

export default function ProductTypesPage() {
  const [types, setTypes] = useState<ProductType[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const loadTypes = async () => {
    try {
      const res = await fetch("/api/admin/product-types", { cache: "no-store" });
      const data = await res.json();
      setTypes(data.productTypes || []);
    } catch {
      toast.error("Failed to load product types");
    }
  };

  useEffect(() => {
    loadTypes();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/product-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to create");
      } else {
        toast.success("Product type created");
        setName("");
        loadTypes();
      }
    } catch {
      toast.error("Failed to create product type");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (type: ProductType) => {
    setEditingId(type.id);
    setEditName(type.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) {
      toast.error("Name cannot be empty");
      return;
    }

    try {
      const res = await fetch(`/api/admin/product-types/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to update");
      } else {
        toast.success("Product type updated");
        setEditingId(null);
        loadTypes();
      }
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleDelete = async (id: string, typeName: string) => {
    if (!confirm(`Delete "${typeName}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/admin/product-types/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to delete");
      } else {
        toast.success("Product type deleted");
        loadTypes();
      }
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4">
      <Toaster />
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">Manage Product Types</h1>
          <a href="/admin" className="text-sm text-blue-600 hover:underline">
            ← Back to Admin
          </a>
        </div>

        {/* Add New Type */}
        <form
          onSubmit={handleAdd}
          className="bg-white border border-slate-200 rounded-lg p-3 flex gap-2"
        >
          <input
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            placeholder="New product type (e.g. Basin, Tap, Toilet)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="submit"
            className="rounded bg-amber-500 text-white px-4 py-2 text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
            disabled={loading || !name.trim()}
          >
            Add
          </button>
        </form>

        {/* Types List */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {types.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-500 text-sm">
              No product types yet. Add some like: Basin, Tap, Toilet, Shower, Vanity, etc.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {types.map((t) => (
                <li key={t.id} className="px-4 py-3 flex items-center gap-3">
                  {editingId === t.id ? (
                    <>
                      <input
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:ring-2 focus:ring-amber-500"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(t.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                      <button
                        onClick={() => saveEdit(t.id)}
                        className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-slate-800">{t.name}</span>
                      <button
                        onClick={() => startEdit(t)}
                        className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(t.id, t.name)}
                        className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-slate-400">
          Note: Types with products cannot be deleted. Remove or reassign products first.
        </p>
      </div>
    </main>
  );
}

