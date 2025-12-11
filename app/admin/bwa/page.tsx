"use client";

import { useState } from "react";
import toast, { Toaster } from "react-hot-toast";

type Row = {
  id: string;
  code: string;
  manufacturerDescription: string;
  price: string;
  imageUrl: string;
  notes: string;
};

export default function BwaPage() {
  const [rows, setRows] = useState<Row[]>([
    { id: crypto.randomUUID(), code: "", manufacturerDescription: "", price: "", imageUrl: "", notes: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);

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
            manufacturerDescription: r.manufacturerDescription || "",
            price: r.price || "",
            imageUrl: r.imageUrl || "",
            notes: "",
          })) || [];
        if (imported.length === 0) {
          toast.error("No rows detected in PDF.");
        } else {
          setRows(imported);
          toast.success(`Imported ${imported.length} rows from PDF`);
        }
      }
    } catch {
      toast.error("Failed to extract");
    } finally {
      setExtracting(false);
    }
  };

  const update = (id: string, field: keyof Row, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      { id: crypto.randomUUID(), code: "", manufacturerDescription: "", price: "", imageUrl: "", notes: "" },
    ]);

  const removeRow = (id: string) => {
    if (rows.length === 1) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleImport = async () => {
    const payload = rows
      .filter((r) => r.code.trim())
      .map((r) => ({
        code: r.code.trim(),
        description: r.manufacturerDescription.trim() || r.code.trim(),
        manufacturerDescription: r.manufacturerDescription.trim(),
        productDetails: r.notes.trim(),
        price: r.price.trim(),
        imageUrl: r.imageUrl.trim(),
        areaName: "Other",
      }));

    if (payload.length === 0) {
      toast.error("Add at least one row with Product Code");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/product-selection/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to import");
      } else {
        toast.success(`Imported ${data?.products?.length ?? payload.length} products`);
      }
    } catch {
      toast.error("Failed to import");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 py-16 px-4">
      <Toaster />
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">BWA Import (Builder Warehouse AU)</h1>
        <p className="text-sm text-slate-600">
          Columns: Product Code → code, Product Name → manufacturer description, Unit Price (EX GST) → price. Edit rows then add to system.
        </p>
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 flex items-center gap-3">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="text-sm"
          />
          {extracting && <span className="text-sm text-slate-500">Extracting...</span>}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
          <div className="grid grid-cols-[1.5fr,2fr,1fr,2fr,1fr] gap-3 text-sm font-semibold text-slate-600 mb-2">
            <span>Product Code</span>
            <span>Product Name (Manufacturer Description)</span>
            <span>Price (ex GST)</span>
            <span>Image URL (optional)</span>
            <span>Notes</span>
          </div>
          <div className="space-y-3">
            {rows.map((r, idx) => (
              <div
                key={r.id}
                className="grid grid-cols-[1.5fr,2fr,1fr,2fr,1fr] gap-3 items-center text-sm"
              >
                <input
                  className="rounded border border-slate-300 px-2 py-1"
                  value={r.code}
                  onChange={(e) => update(r.id, "code", e.target.value.toUpperCase())}
                  placeholder="e.g. BW-001"
                />
                <input
                  className="rounded border border-slate-300 px-2 py-1"
                  value={r.manufacturerDescription}
                  onChange={(e) => update(r.id, "manufacturerDescription", e.target.value)}
                  placeholder="Product Name"
                />
                <input
                  className="rounded border border-slate-300 px-2 py-1"
                  value={r.price}
                  onChange={(e) => update(r.id, "price", e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="99.99"
                />
                <input
                  className="rounded border border-slate-300 px-2 py-1"
                  value={r.imageUrl}
                  onChange={(e) => update(r.id, "imageUrl", e.target.value)}
                  placeholder="https://..."
                />
                <div className="flex gap-2 items-center">
                  <input
                    className="rounded border border-slate-300 px-2 py-1 w-full"
                    value={r.notes}
                    onChange={(e) => update(r.id, "notes", e.target.value)}
                    placeholder="Notes"
                  />
                  {rows.length > 1 && (
                    <button
                      className="text-red-500 text-xs"
                      type="button"
                      onClick={() => removeRow(r.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              className="px-3 py-2 rounded-md border border-slate-300 text-sm"
              onClick={addRow}
            >
              + Add Row
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-md bg-amber-500 text-white text-sm font-semibold disabled:opacity-60"
              onClick={handleImport}
              disabled={saving}
            >
              {saving ? "Importing..." : "Add to system"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

