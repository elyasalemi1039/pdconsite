"use client";

import { useState } from "react";
import toast, { Toaster } from "react-hot-toast";

type Row = {
  id: string;
  code: string;
  name: string;
  imageBase64: string | null;
  brand: string;
  nickname: string;
  keywords: string;
  link: string;
  productDetails: string;
};

export default function BwaPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [selectedArea, setSelectedArea] = useState("Kitchen");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const handleFile = async (file: File) => {
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/bwa/extract", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to extract");
      } else {
        const imported =
          (data.rows || []).map((r: any) => ({
            id: crypto.randomUUID(),
            code: r.code || "",
            name: r.name || "",
            imageBase64: r.imageBase64 || null,
            brand: "BWA",
            nickname: "",
            keywords: "bwa, builder warehouse",
            link: "",
            productDetails: "",
          })) || [];
        if (imported.length === 0) {
          toast.error("No products detected in file.");
        } else {
          setRows(imported);
          toast.success(`Imported ${imported.length} products from file`);
        }
      }
    } catch {
      toast.error("Failed to extract");
    } finally {
      setExtracting(false);
    }
  };

  const update = (id: string, field: keyof Row, value: string | null) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleImport = async () => {
    const validRows = rows.filter((r) => r.code.trim());

    if (validRows.length === 0) {
      toast.error("No valid products to import");
      return;
    }

    setSaving(true);
    let successCount = 0;
    let errorCount = 0;

    // Process in batches of 3 for speed
    const batchSize = 3;
    for (let i = 0; i < validRows.length; i += batchSize) {
      const batch = validRows.slice(i, i + batchSize);
      
      const results = await Promise.all(
        batch.map(async (r) => {
          try {
            const formData = new FormData();
            formData.append("code", r.code.trim());
            formData.append("areaId", ""); // Will need to select area
            formData.append("description", r.name.trim() || r.code.trim());
            formData.append("productDetails", r.productDetails.trim());
            formData.append("link", r.link.trim());
            formData.append("brand", r.brand.trim());
            formData.append("nickname", r.nickname.trim());
            formData.append("keywords", r.keywords.trim());
            formData.append("areaName", selectedArea);

            // If we have base64 image, convert to blob and append
            if (r.imageBase64) {
              const byteString = atob(r.imageBase64);
              const ab = new ArrayBuffer(byteString.length);
              const ia = new Uint8Array(ab);
              for (let j = 0; j < byteString.length; j++) {
                ia[j] = byteString.charCodeAt(j);
              }
              const blob = new Blob([ab], { type: "image/png" });
              formData.append("image", blob, `${r.code}.png`);
            }

            const res = await fetch("/api/admin/products/bwa", {
              method: "POST",
              body: formData,
            });

            if (!res.ok) {
              const data = await res.json();
              console.error(`Failed to import ${r.code}:`, data?.error);
              return false;
            }
            return true;
          } catch (err) {
            console.error(`Error importing ${r.code}:`, err);
            return false;
          }
        })
      );

      successCount += results.filter(Boolean).length;
      errorCount += results.filter((r) => !r).length;
    }

    setSaving(false);

    if (successCount > 0) {
      toast.success(`Imported ${successCount} products`);
    }
    if (errorCount > 0) {
      toast.error(`Failed to import ${errorCount} products`);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 py-16 px-4">
      <Toaster />
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">BWA Import</h1>
            <p className="text-sm text-slate-600">
              Upload a BWA PDF to extract products with images. The "BWA" prefix will be automatically removed from codes.
            </p>
          </div>
          <a href="/admin" className="text-sm text-blue-600 hover:underline">
            ← Back to Admin
          </a>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 space-y-4">
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Upload BWA PDF or DOCX
              </label>
              <input
                type="file"
                accept="application/pdf,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
                className="text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Target Area
              </label>
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="Kitchen">Kitchen</option>
                <option value="Bathroom">Bathroom</option>
                <option value="Bedroom">Bedroom</option>
                <option value="Living Room">Living Room</option>
                <option value="Laundry">Laundry</option>
                <option value="Balcony">Balcony</option>
                <option value="Other">Other</option>
              </select>
            </div>
            {extracting && <span className="text-sm text-slate-500">Extracting...</span>}
          </div>
        </div>

        {rows.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">
                Extracted Products ({rows.length})
              </h2>
              <button
                type="button"
                className="px-4 py-2 rounded-md bg-amber-500 text-white text-sm font-semibold disabled:opacity-60"
                onClick={handleImport}
                disabled={saving}
              >
                {saving ? "Importing..." : `Import ${rows.length} Products`}
              </button>
            </div>

            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {rows.map((r) => {
                const isExpanded = expandedRows.has(r.id);
                return (
                  <div
                    key={r.id}
                    className="border border-slate-200 rounded-lg bg-slate-50 overflow-hidden"
                  >
                    {/* Collapsed View */}
                    <div className="flex items-center gap-4 p-3">
                      {/* Image Preview */}
                      <div className="w-16 h-16 flex-shrink-0 bg-white border border-slate-200 rounded overflow-hidden">
                        {r.imageBase64 ? (
                          <img
                            src={`data:image/png;base64,${r.imageBase64}`}
                            alt={r.code}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                            No Image
                          </div>
                        )}
                      </div>

                      {/* Basic Info */}
                      <div className="flex-1">
                        <div className="font-semibold text-slate-800">{r.code}</div>
                        <div className="text-sm text-slate-600 line-clamp-1">{r.name}</div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="px-3 py-1 text-xs rounded border border-slate-300 hover:bg-white"
                          onClick={() => {
                            setExpandedRows(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(r.id)) {
                                newSet.delete(r.id);
                              } else {
                                newSet.add(r.id);
                              }
                              return newSet;
                            });
                          }}
                        >
                          {isExpanded ? "Collapse" : "Edit Details"}
                        </button>
                        <button
                          type="button"
                          className="text-red-500 text-sm hover:underline"
                          onClick={() => removeRow(r.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {/* Expanded View */}
                    {isExpanded && (
                      <div className="border-t border-slate-200 p-4 bg-white space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Code *
                            </label>
                            <input
                              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                              value={r.code}
                              onChange={(e) => update(r.id, "code", e.target.value.toUpperCase())}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Brand
                            </label>
                            <input
                              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                              value={r.brand}
                              onChange={(e) => update(r.id, "brand", e.target.value)}
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Name / Description *
                          </label>
                          <input
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                            value={r.name}
                            onChange={(e) => update(r.id, "name", e.target.value)}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Nickname
                            </label>
                            <input
                              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                              value={r.nickname}
                              onChange={(e) => update(r.id, "nickname", e.target.value)}
                              placeholder="e.g. The Black Beast"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Product Link
                            </label>
                            <input
                              type="url"
                              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                              value={r.link}
                              onChange={(e) => update(r.id, "link", e.target.value)}
                              placeholder="https://..."
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Keywords (comma-separated)
                          </label>
                          <input
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                            value={r.keywords}
                            onChange={(e) => update(r.id, "keywords", e.target.value)}
                            placeholder="e.g. basin, sink, white, modern"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Product Details
                          </label>
                          <textarea
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                            rows={2}
                            value={r.productDetails}
                            onChange={(e) => update(r.id, "productDetails", e.target.value)}
                            placeholder="Additional product details..."
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {rows.length === 0 && !extracting && (
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-8 text-center text-slate-500">
            Upload a BWA PDF or DOCX file to get started
          </div>
        )}
      </div>
    </main>
  );
}
