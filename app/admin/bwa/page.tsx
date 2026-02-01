"use client";

import { useEffect, useState } from "react";
import toast, { Toaster } from "react-hot-toast";

type Row = {
  id: string;
  code: string;
  name: string;
  imageBase64: string | null;
  brand: string;
  keywords: string;
  link: string;
  productDetails: string;
  area: string;
  price: string;
};

type Area = {
  id: string;
  name: string;
};

type Supplier = {
  id: string;
  name: string;
  columnMappings: { column: number; field: string }[];
  startRow: number;
  hasHeaderRow: boolean;
};

export default function ProductImportPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [areas, setAreas] = useState<Area[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bulkArea, setBulkArea] = useState<string>("");

  useEffect(() => {
    fetch("/api/admin/areas")
      .then((res) => res.json())
      .then((data) => {
        if (data.areas) {
          setAreas(data.areas);
          if (data.areas.length > 0) {
            setBulkArea(data.areas[0].name);
          }
        }
      })
      .catch(() => toast.error("Failed to load areas"));

    fetch("/api/admin/suppliers")
      .then((res) => res.json())
      .then((data) => {
        if (data.suppliers) {
          setSuppliers(data.suppliers);
        }
      })
      .catch(() => toast.error("Failed to load suppliers"));
  }, []);

  const handleFile = async (file: File) => {
    if (!selectedSupplierId) {
      toast.error("Please select a supplier first");
      return;
    }

    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("supplierId", selectedSupplierId);
      
      const res = await fetch("/api/admin/bwa/extract", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to extract");
      } else {
        const defaultArea = bulkArea || areas[0]?.name || "Kitchen";
        const imported = (data.rows || []).map((r: any) => ({
          id: crypto.randomUUID(),
          code: r.code || "",
          name: r.name || r.description || "",
          imageBase64: r.imageBase64 || null,
          brand: r.brand || "",
          keywords: r.keywords || "",
          link: r.link || "",
          productDetails: r.productDetails || "",
          area: r.area || defaultArea,
          price: r.price || "",
        }));
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

  const applyBulkArea = () => {
    if (!bulkArea) return;
    setRows((prev) => prev.map((r) => ({ ...r, area: bulkArea })));
    toast.success(`Set all products to "${bulkArea}"`);
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
    let skippedCount = 0;

    const batchSize = 15;
    for (let i = 0; i < validRows.length; i += batchSize) {
      const batch = validRows.slice(i, i + batchSize);
      
      const results = await Promise.all(
        batch.map(async (r) => {
          try {
            const formData = new FormData();
            formData.append("code", r.code.trim());
            formData.append("areaId", "");
            formData.append("description", r.name.trim() || r.code.trim());
            formData.append("productDetails", r.productDetails.trim());
            formData.append("link", r.link.trim());
            formData.append("brand", r.brand.trim());
            formData.append("keywords", r.keywords.trim());
            formData.append("areaName", r.area);

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
              if (data?.error?.includes("already exists")) {
                return "skipped";
              }
              return "error";
            }
            return "success";
          } catch {
            return "error";
          }
        })
      );

      successCount += results.filter((r) => r === "success").length;
      errorCount += results.filter((r) => r === "error").length;
      skippedCount += results.filter((r) => r === "skipped").length;
    }

    setSaving(false);

    const messages = [];
    if (successCount > 0) messages.push(`✓ ${successCount} imported`);
    if (skippedCount > 0) messages.push(`⊘ ${skippedCount} duplicates`);
    if (errorCount > 0) messages.push(`✗ ${errorCount} failed`);

    if (messages.length > 0) {
      if (errorCount > 0) {
        toast.error(messages.join(" | "));
      } else {
        toast.success(messages.join(" | "));
      }
    }
  };

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4">
      <Toaster />
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Product Import</h1>
            <p className="text-sm text-slate-500">Upload supplier files to extract products</p>
          </div>
          <a href="/admin" className="text-sm text-blue-600 hover:underline">← Back</a>
        </div>

        {/* Setup Row */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">Supplier</label>
            {suppliers.length === 0 ? (
              <a href="/admin/suppliers" className="text-sm text-blue-600 hover:underline">
                + Add a supplier first
              </a>
            ) : (
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm"
              >
                <option value="">Select supplier...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
          
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Upload File</label>
            <input
              type="file"
              accept="application/pdf,.docx"
              disabled={!selectedSupplierId || extracting}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
              className="text-sm file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-amber-500 file:text-white file:text-sm file:cursor-pointer disabled:opacity-50"
            />
          </div>
          
          {extracting && <span className="text-sm text-slate-500 animate-pulse">Extracting...</span>}
        </div>

        {selectedSupplier && (
          <p className="text-xs text-slate-400">
            Columns: {selectedSupplier.columnMappings.map((m) => `${m.column}→${m.field}`).join(", ")}
          </p>
        )}

        {/* Products List */}
        {rows.length > 0 && (
          <div className="space-y-3">
            {/* Bulk Actions */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-amber-800">Bulk:</span>
              <select
                value={bulkArea}
                onChange={(e) => setBulkArea(e.target.value)}
                className="px-2 py-1 border border-amber-300 rounded bg-white text-sm"
              >
                {areas.map((a) => (
                  <option key={a.id} value={a.name}>{a.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={applyBulkArea}
                className="px-3 py-1 bg-amber-500 text-white text-sm rounded hover:bg-amber-600"
              >
                Apply to All
              </button>
              <div className="flex-1" />
              <span className="text-sm text-slate-600">{rows.length} products</span>
              <button
                type="button"
                onClick={handleImport}
                disabled={saving}
                className="px-4 py-1.5 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? "Importing..." : "Import All"}
              </button>
            </div>

            {/* Product Cards */}
            <div className="space-y-2">
              {rows.map((r) => {
                const isEditing = editingId === r.id;
                
                return (
                  <div
                    key={r.id}
                    className="bg-white border border-slate-200 rounded-lg overflow-hidden"
                  >
                    <div className="flex items-center gap-3 p-3">
                      {/* Image */}
                      <div className="w-14 h-14 flex-shrink-0 bg-slate-100 border border-slate-200 rounded overflow-hidden">
                        <img
                          src={r.imageBase64 ? `data:image/png;base64,${r.imageBase64}` : "/no-image.png"}
                          alt={r.code}
                          className="w-full h-full object-contain"
                        />
                      </div>

                      {/* Code & Name */}
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <input
                            className="w-full font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-sm mb-1"
                            value={r.code}
                            onChange={(e) => update(r.id, "code", e.target.value.toUpperCase())}
                            placeholder="Code"
                          />
                        ) : (
                          <div className="font-semibold text-slate-800 truncate">{r.code}</div>
                        )}
                        {isEditing ? (
                          <input
                            className="w-full text-slate-600 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-sm"
                            value={r.name}
                            onChange={(e) => update(r.id, "name", e.target.value)}
                            placeholder="Description"
                          />
                        ) : (
                          <div className="text-sm text-slate-500 truncate">{r.name}</div>
                        )}
                      </div>

                      {/* Area Dropdown - Always Visible */}
                      <select
                        value={r.area}
                        onChange={(e) => update(r.id, "area", e.target.value)}
                        className="px-2 py-1.5 border border-slate-300 rounded bg-white text-sm min-w-[120px]"
                      >
                        {areas.map((a) => (
                          <option key={a.id} value={a.name}>{a.name}</option>
                        ))}
                      </select>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingId(isEditing ? null : r.id)}
                          className={`px-2 py-1 text-xs rounded ${
                            isEditing 
                              ? "bg-green-100 text-green-700" 
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {isEditing ? "Done" : "Edit"}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeRow(r.id)}
                          className="px-2 py-1 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Expanded Edit */}
                    {isEditing && (
                      <div className="border-t border-slate-100 bg-slate-50 p-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                        <input
                          className="px-2 py-1.5 border border-slate-300 rounded text-sm bg-white"
                          value={r.brand}
                          onChange={(e) => update(r.id, "brand", e.target.value)}
                          placeholder="Brand"
                        />
                        <input
                          className="px-2 py-1.5 border border-slate-300 rounded text-sm bg-white"
                          value={r.keywords}
                          onChange={(e) => update(r.id, "keywords", e.target.value)}
                          placeholder="Keywords"
                        />
                        <input
                          className="px-2 py-1.5 border border-slate-300 rounded text-sm bg-white"
                          value={r.link}
                          onChange={(e) => update(r.id, "link", e.target.value)}
                          placeholder="Link URL"
                        />
                        <input
                          className="px-2 py-1.5 border border-slate-300 rounded text-sm bg-white col-span-2 md:col-span-1"
                          value={r.productDetails}
                          onChange={(e) => update(r.id, "productDetails", e.target.value)}
                          placeholder="Details"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {rows.length === 0 && !extracting && (
          <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
            <div className="text-4xl mb-3">📄</div>
            <p className="text-slate-500">
              {suppliers.length === 0 
                ? "Add a supplier to get started" 
                : "Select a supplier and upload a file"}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
