"use client";

import { useEffect, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";

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
  typeId: string | null;
  type: ProductType | null;
  createdAt: string;
};

export default function ViewProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);

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

  // Auto-save a single field
  const saveField = async (productId: string, field: string, value: string | null) => {
    setSavingField(`${productId}-${field}`);
    try {
      const res = await fetch(`/api/admin/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to save");
        return false;
      }

      const data = await res.json();
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, ...data.product } : p))
      );
      toast.success("Saved", { duration: 1500 });
      return true;
    } catch (error) {
      toast.error("Failed to save");
      return false;
    } finally {
      setSavingField(null);
    }
  };

  // Quick update type with auto-save
  const updateType = async (productId: string, typeId: string) => {
    // Optimistic update
    const type = productTypes.find((t) => t.id === typeId);
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId ? { ...p, typeId, type: type || null } : p
      )
    );
    await saveField(productId, "typeId", typeId);
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

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4">
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

        {/* Product Cards */}
        <div className="space-y-3">
          {products.map((p) => {
            const isExpanded = expandedId === p.id;
            const isSaving = savingField?.startsWith(p.id);

            return (
              <div
                key={p.id}
                className={`bg-white border rounded-lg shadow-sm overflow-hidden transition-all ${
                  isExpanded ? "border-amber-300" : "border-slate-200"
                }`}
              >
                {/* Compact Row */}
                <div className="flex items-center gap-4 p-3">
                  {/* Image */}
                  <img
                    src={p.imageUrl || "/no-image.png"}
                    alt={p.description}
                    className="h-14 w-20 object-cover rounded border border-slate-200 flex-shrink-0"
                  />

                  {/* Code & Description */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{p.code}</span>
                      {p.brand && (
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                          {p.brand}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 truncate">{p.description}</p>
                  </div>

                  {/* Type Dropdown - Always Visible */}
                  <div className="w-36 flex-shrink-0">
                    <SearchableDropdown
                      options={productTypes}
                      value={p.typeId || ""}
                      onChange={(id) => updateType(p.id, id)}
                      placeholder="Select type..."
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => toggleExpand(p.id)}
                      className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                        isExpanded
                          ? "bg-amber-100 border-amber-300 text-amber-700"
                          : "border-slate-300 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {isExpanded ? "Close" : "Edit"}
                    </button>
                    <button
                      onClick={() => deleteProduct(p.id, p.code)}
                      className="text-xs px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Expanded Edit Panel */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Code */}
                      <EditableField
                        label="Code"
                        value={p.code}
                        onSave={(v) => saveField(p.id, "code", v.toUpperCase())}
                        isSaving={savingField === `${p.id}-code`}
                      />

                      {/* Description */}
                      <EditableField
                        label="Description"
                        value={p.description}
                        onSave={(v) => saveField(p.id, "description", v)}
                        isSaving={savingField === `${p.id}-description`}
                        multiline
                      />

                      {/* Brand */}
                      <EditableField
                        label="Brand"
                        value={p.brand || ""}
                        onSave={(v) => saveField(p.id, "brand", v || null)}
                        isSaving={savingField === `${p.id}-brand`}
                      />

                      {/* Keywords */}
                      <EditableField
                        label="Keywords"
                        value={p.keywords || ""}
                        onSave={(v) => saveField(p.id, "keywords", v || null)}
                        isSaving={savingField === `${p.id}-keywords`}
                      />

                      {/* Link */}
                      <EditableField
                        label="Link"
                        value={p.link || ""}
                        onSave={(v) => saveField(p.id, "link", v || null)}
                        isSaving={savingField === `${p.id}-link`}
                      />

                      {/* Product Details */}
                      <EditableField
                        label="Product Details"
                        value={p.productDetails || ""}
                        onSave={(v) => saveField(p.id, "productDetails", v || null)}
                        isSaving={savingField === `${p.id}-productDetails`}
                        multiline
                      />
                    </div>

                    <div className="mt-3 text-xs text-slate-400">
                      Created: {new Date(p.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {products.length === 0 && !loading && (
            <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-500">
              No products found.
            </div>
          )}
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

// Inline editable field component
function EditableField({
  label,
  value,
  onSave,
  isSaving,
  multiline = false,
}: {
  label: string;
  value: string;
  onSave: (value: string) => Promise<boolean>;
  isSaving: boolean;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);

  const handleBlur = async () => {
    if (localValue !== value) {
      const success = await onSave(localValue);
      if (!success) {
        setLocalValue(value); // Revert on failure
      }
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !multiline) {
      (e.target as HTMLElement).blur();
    }
    if (e.key === "Escape") {
      setLocalValue(value);
      setEditing(false);
    }
  };

  if (!editing) {
    return (
      <div>
        <label className="block text-xs text-slate-500 mb-1">{label}</label>
        <div
          onClick={() => {
            setEditing(true);
            setLocalValue(value);
          }}
          className="px-2 py-1.5 text-sm bg-white border border-slate-200 rounded cursor-text hover:border-amber-300 min-h-[32px] truncate"
        >
          {value || <span className="text-slate-400">Click to edit...</span>}
        </div>
      </div>
    );
  }

  const InputComponent = multiline ? "textarea" : "input";

  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">
        {label} {isSaving && <span className="text-amber-500">(saving...)</span>}
      </label>
      <InputComponent
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoFocus
        rows={multiline ? 2 : undefined}
        className="w-full px-2 py-1.5 text-sm border border-amber-400 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
      />
    </div>
  );
}
