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
  price: string;
  link: string;
  keywords: string;
  imageFile: File | null;
  imagePreview: string | null;
};

export default function CreateProductForm() {
  const router = useRouter();
  const [areas, setAreas] = useState<Area[]>([]);
  const [loadingAreas, setLoadingAreas] = useState(false);
  const [forms, setForms] = useState<ProductForm[]>([
    {
      id: crypto.randomUUID(),
      code: "",
      areaId: "",
      description: "",
      productDetails: "",
      price: "",
      link: "",
      keywords: "",
      imageFile: null,
      imagePreview: null,
    },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateForm = (id: string, updates: Partial<ProductForm>) => {
    setForms((prev) =>
      prev.map((form) => (form.id === id ? { ...form, ...updates } : form))
    );
  };

  const addForm = () => {
    setForms((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        code: "",
        areaId: "",
        description: "",
        productDetails: "",
        price: "",
        link: "",
        keywords: "",
        imageFile: null,
        imagePreview: null,
      },
    ]);
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    // Validate all forms
    for (const form of forms) {
      if (!form.code.trim()) {
        setError("Product code is required for all products.");
        return;
      }
      if (!form.description.trim()) {
        setError("Description is required for all products.");
        return;
      }
      if (!form.imageFile) {
        setError("Image is required for all products.");
        return;
      }
      if (!form.areaId) {
        setError("Area is required for all products.");
        return;
      }
    }

    setSaving(true);

    try {
      // Save all products
      for (const form of forms) {
        // Compress image
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
        };
        const compressedFile = await imageCompression(form.imageFile!, options);

        const formData = new FormData();
        formData.append("code", form.code.trim());
        formData.append("areaId", form.areaId);
        formData.append("description", form.description.trim());
        formData.append("productDetails", form.productDetails.trim());
        const cleanPrice = form.price.trim();
        formData.append("price", cleanPrice);
        formData.append("link", form.link.trim());
        formData.append("keywords", form.keywords.trim());
        formData.append("image", compressedFile);

        const res = await fetch("/api/admin/products", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data?.error || "Failed to create product.");
          setSaving(false);
          return;
        }
      }

      // Success - redirect to admin with toast
      toast.success(`${forms.length} product(s) added successfully!`, {
        duration: 4000,
        position: "bottom-right",
        style: {
          background: "#10b981",
          color: "#fff",
        },
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
      <form onSubmit={handleSubmit} className="space-y-6">
        {forms.map((form, index) => (
          <div
            key={form.id}
            className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                Product {index + 1}
              </h3>
              {forms.length > 1 && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => removeForm(form.id)}
                >
                  Remove
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr,280px] gap-6">
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-700">
                    Code<span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    value={form.code}
                    onChange={(e) =>
                      updateForm(form.id, { code: e.target.value.toUpperCase() })
                    }
                    placeholder="e.g. A001"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-700">
                    Area<span className="text-red-600">*</span>
                  </label>
                  <select
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
                    value={form.areaId}
                    onChange={(e) =>
                      updateForm(form.id, { areaId: e.target.value })
                    }
                    required
                  >
                    <option value="">Select area</option>
                    {areas.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-700">
                    Description<span className="text-red-600">*</span>
                  </label>
                  <textarea
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    rows={3}
                    value={form.description}
                    onChange={(e) =>
                      updateForm(form.id, { description: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-700">
                    Product Details
                  </label>
                  <textarea
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    rows={2}
                    value={form.productDetails}
                    onChange={(e) =>
                      updateForm(form.id, { productDetails: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-700">
                    Price
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                      $
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 pl-7 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      value={form.price}
                      onChange={(e) => {
                        const raw = e.target.value;
                        let cleaned = raw.replace(/[^\d.]/g, "");
                        const parts = cleaned.split(".");
                        if (parts.length > 2) {
                          cleaned = `${parts[0]}.${parts.slice(1).join("")}`;
                        }
                        if (cleaned.includes(".")) {
                          const [int, dec] = cleaned.split(".");
                          cleaned = `${int}.${(dec || "").slice(0, 2)}`;
                        }
                        updateForm(form.id, { price: cleaned });
                      }}
                      placeholder="e.g. 199.99"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Numbers only; $ is prefixed automatically.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-700">
                    Product Link
                  </label>
                  <input
                    type="url"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    value={form.link}
                    onChange={(e) =>
                      updateForm(form.id, { link: e.target.value })
                    }
                    placeholder="https://example.com/product"
                  />
                  <p className="text-xs text-slate-500">
                    URL link to the product page (optional)
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-700">
                    Keywords
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    value={form.keywords}
                    onChange={(e) =>
                      updateForm(form.id, { keywords: e.target.value })
                    }
                    placeholder="e.g. black, modern, sink, marble"
                  />
                  <p className="text-xs text-slate-500">
                    Comma-separated keywords for search (optional)
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-700">
                    Image<span className="text-red-600">*</span>
                  </label>
                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 flex flex-col items-center justify-center gap-2 bg-slate-50">
                    {form.imagePreview ? (
                      <div className="relative w-full max-w-[160px] aspect-[4/3] bg-slate-200 rounded-md overflow-hidden">
                        <img
                          src={form.imagePreview}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 text-center">
                        Upload product image
                      </p>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        updateForm(form.id, {
                          imageFile: file,
                          imagePreview: file ? URL.createObjectURL(file) : null,
                        });
                      }}
                      className="w-full text-sm"
                      required={!form.imageFile}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={addForm}
            disabled={saving}
          >
            Add Product
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Adding to system..." : "Add to System"}
          </Button>
        </div>
      </form>
    </>
  );
}
