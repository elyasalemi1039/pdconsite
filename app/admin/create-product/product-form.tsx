"use client";

import imageCompression from "browser-image-compression";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast, { Toaster } from "react-hot-toast";

import { Button } from "@/components/ui/button";

type Area = {
  id: string;
  name: string;
};

type ProductForm = {
  id: string;
  code: string;
  areaId: string;
  description: string;
  productDetails: string;
  link: string;
  brand: string;
  keywords: string;
  imageFile: File | null;
  imagePreview: string | null;
};

const createEmptyForm = (): ProductForm => ({
  id: crypto.randomUUID(),
  code: "",
  areaId: "",
  description: "",
  productDetails: "",
  link: "",
  brand: "",
  keywords: "",
  imageFile: null,
  imagePreview: null,
});

export default function CreateProductForm() {
  const router = useRouter();
  const [areas, setAreas] = useState<Area[]>([]);
  const [loadingAreas, setLoadingAreas] = useState(false);
  const [forms, setForms] = useState<ProductForm[]>([createEmptyForm()]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState<Set<string>>(new Set());

  const updateForm = (id: string, updates: Partial<ProductForm>) => {
    setForms((prev) =>
      prev.map((form) => (form.id === id ? { ...form, ...updates } : form))
    );
  };

  const addForm = () => {
    setForms((prev) => [...prev, createEmptyForm()]);
  };

  useEffect(() => {
    const loadAreas = async () => {
      setLoadingAreas(true);
      try {
        const res = await fetch("/api/admin/areas", { cache: "no-store" });
        const data = await res.json();
        setAreas(data.areas || []);
      } catch (err) {
        setError("Failed to load areas. Create one in Admin > Areas.");
      } finally {
        setLoadingAreas(false);
      }
    };
    loadAreas();
  }, []);

  const removeForm = (id: string) => {
    if (forms.length === 1) {
      setError("You need at least one product form.");
      return;
    }
    setForms((prev) => prev.filter((form) => form.id !== id));
  };

  const toggleAdvanced = (id: string) => {
    setShowAdvanced((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    for (const form of forms) {
      if (!form.code.trim()) {
        setError("Product code is required for all products.");
        return;
      }
      if (!form.description.trim()) {
        setError("Description is required for all products.");
        return;
      }
      if (!form.areaId) {
        setError("Area is required for all products.");
        return;
      }
    }

    setSaving(true);
    setProgress({ current: 0, total: forms.length });

    try {
      const preparedForms = await Promise.all(
        forms.map(async (form) => {
          let compressedFile: File | Blob | null = null;
          
          if (form.imageFile) {
            const options = {
              maxSizeMB: 1,
              maxWidthOrHeight: 1920,
              useWebWorker: true,
            };
            compressedFile = await imageCompression(form.imageFile, options);
          }

          const formData = new FormData();
          formData.append("code", form.code.trim());
          formData.append("areaId", form.areaId);
          formData.append("description", form.description.trim());
          formData.append("productDetails", form.productDetails.trim());
          formData.append("link", form.link.trim());
          formData.append("brand", form.brand.trim());
          formData.append("keywords", form.keywords.trim());
          
          if (compressedFile) {
            formData.append("image", compressedFile);
          }

          return { form, formData };
        })
      );

      const batchSize = 3;
      const results: { success: boolean; error?: string }[] = [];

      for (let i = 0; i < preparedForms.length; i += batchSize) {
        const batch = preparedForms.slice(i, i + batchSize);
        
        const batchResults = await Promise.all(
          batch.map(async ({ formData }) => {
            try {
              const res = await fetch("/api/admin/products", {
                method: "POST",
                body: formData,
              });
              const data = await res.json();
              
              if (!res.ok) {
                return { success: false, error: data?.error || "Failed to create product" };
              }
              return { success: true };
            } catch (err) {
              return { success: false, error: "Network error" };
            }
          })
        );

        results.push(...batchResults);
        setProgress({ current: Math.min(i + batchSize, preparedForms.length), total: forms.length });
      }

      const errors = results.filter((r) => !r.success);
      if (errors.length > 0) {
        setError(`Failed to create ${errors.length} product(s): ${errors[0].error}`);
        setSaving(false);
        return;
      }

      toast.success(`${forms.length} product(s) added!`, {
        duration: 3000,
        position: "bottom-right",
      });

      setTimeout(() => {
        router.push("/admin");
      }, 500);
    } catch (err) {
      setError("Network error while saving products.");
      setSaving(false);
    }
  };

  return (
    <>
      <Toaster />
      <form onSubmit={handleSubmit} className="space-y-4">
        {forms.map((form, index) => (
          <div
            key={form.id}
            className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden"
          >
            {/* Main Row - Always Visible */}
            <div className="p-4 flex flex-wrap items-start gap-4">
              {/* Image Upload */}
              <div className="w-24 h-24 flex-shrink-0">
                <label className="block w-full h-full border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-amber-400 overflow-hidden bg-slate-50">
                  {form.imagePreview ? (
                    <img
                      src={form.imagePreview}
                      alt="Preview"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                      <span className="text-2xl">📷</span>
                      <span className="text-xs">Image</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      updateForm(form.id, {
                        imageFile: file,
                        imagePreview: file ? URL.createObjectURL(file) : null,
                      });
                    }}
                  />
                </label>
              </div>

              {/* Core Fields */}
              <div className="flex-1 min-w-[280px] space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    value={form.code}
                    onChange={(e) => updateForm(form.id, { code: e.target.value.toUpperCase() })}
                    placeholder="Product Code *"
                    required
                  />
                  <select
                    className="w-36 rounded border border-slate-300 px-2 py-2 text-sm bg-white focus:ring-2 focus:ring-amber-500"
                    value={form.areaId}
                    onChange={(e) => updateForm(form.id, { areaId: e.target.value })}
                    required
                  >
                    <option value="">Area *</option>
                    {areas.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                  </select>
                </div>

                <input
                  type="text"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  value={form.description}
                  onChange={(e) => updateForm(form.id, { description: e.target.value })}
                  placeholder="Description *"
                  required
                />

                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500"
                    value={form.brand}
                    onChange={(e) => updateForm(form.id, { brand: e.target.value })}
                    placeholder="Brand"
                  />
                  <button
                    type="button"
                    onClick={() => toggleAdvanced(form.id)}
                    className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700 border border-slate-300 rounded bg-slate-50"
                  >
                    {showAdvanced.has(form.id) ? "Less ▲" : "More ▼"}
                  </button>
                </div>
              </div>

              {/* Remove Button */}
              {forms.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeForm(form.id)}
                  className="text-red-500 hover:text-red-700 text-lg p-1"
                  title="Remove"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Advanced Fields */}
            {showAdvanced.has(form.id) && (
              <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input
                    type="text"
                    className="rounded border border-slate-300 px-3 py-2 text-sm bg-white"
                    value={form.keywords}
                    onChange={(e) => updateForm(form.id, { keywords: e.target.value })}
                    placeholder="Keywords (comma-separated)"
                  />
                  <input
                    type="url"
                    className="rounded border border-slate-300 px-3 py-2 text-sm bg-white"
                    value={form.link}
                    onChange={(e) => updateForm(form.id, { link: e.target.value })}
                    placeholder="Product Link URL"
                  />
                </div>
                <textarea
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm bg-white"
                  rows={2}
                  value={form.productDetails}
                  onChange={(e) => updateForm(form.id, { productDetails: e.target.value })}
                  placeholder="Product Details..."
                />
              </div>
            )}
          </div>
        ))}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={addForm}
            disabled={saving}
          >
            + Add Another
          </Button>
          <Button type="submit" disabled={saving}>
            {saving 
              ? `Saving ${progress.current}/${progress.total}...` 
              : `Save ${forms.length} Product${forms.length > 1 ? 's' : ''}`}
          </Button>
        </div>
      </form>
    </>
  );
}
