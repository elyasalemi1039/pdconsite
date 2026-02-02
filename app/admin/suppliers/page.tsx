"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import toast, { Toaster } from "react-hot-toast";

type ColumnMapping = {
  column: number;
  field: string;
};

type Supplier = {
  id: string;
  name: string;
  columnMappings: ColumnMapping[];
  startRow: number;
  hasHeaderRow: boolean;
  createdAt: string;
};

const MAPPABLE_FIELDS = [
  { value: "code", label: "Product Code", required: true },
  { value: "description", label: "Description/Name", required: true },
  { value: "image", label: "Image", required: false },
  { value: "price", label: "Price", required: false },
  { value: "productDetails", label: "Product Details", required: false },
  { value: "brand", label: "Brand", required: false },
  { value: "keywords", label: "Keywords", required: false },
  { value: "link", label: "Link/URL", required: false },
  { value: "area", label: "Area/Category", required: false },
  { value: "skip", label: "Skip (Ignore)", required: false },
];

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [columnCount, setColumnCount] = useState(5);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [startRow, setStartRow] = useState(2);
  const [hasHeaderRow, setHasHeaderRow] = useState(true);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  useEffect(() => {
    // Initialize mappings when column count changes
    const newMappings: ColumnMapping[] = [];
    for (let i = 1; i <= columnCount; i++) {
      const existing = mappings.find((m) => m.column === i);
      newMappings.push(existing || { column: i, field: "skip" });
    }
    setMappings(newMappings);
  }, [columnCount]);

  const fetchSuppliers = async () => {
    try {
      const res = await fetch("/api/admin/suppliers");
      const data = await res.json();
      if (data.suppliers) {
        setSuppliers(data.suppliers);
      }
    } catch {
      toast.error("Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setColumnCount(5);
    setMappings([]);
    setStartRow(2);
    setHasHeaderRow(true);
    setEditingSupplier(null);
    setShowForm(false);
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setName(supplier.name);
    setMappings(supplier.columnMappings);
    setColumnCount(supplier.columnMappings.length || 5);
    setStartRow(supplier.startRow);
    setHasHeaderRow(supplier.hasHeaderRow);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this supplier?")) return;

    try {
      const res = await fetch(`/api/admin/suppliers/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete");
      }

      setSuppliers((prev) => prev.filter((s) => s.id !== id));
      toast.success("Supplier deleted");
    } catch {
      toast.error("Failed to delete supplier");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    const hasCode = mappings.some((m) => m.field === "code");
    const hasDescription = mappings.some((m) => m.field === "description");

    if (!hasCode || !hasDescription) {
      toast.error("You must map at least Product Code and Description columns");
      return;
    }

    setSaving(true);

    try {
      const url = editingSupplier
        ? `/api/admin/suppliers/${editingSupplier.id}`
        : "/api/admin/suppliers";
      
      const res = await fetch(url, {
        method: editingSupplier ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          columnMappings: mappings.filter((m) => m.field !== "skip"),
          startRow,
          hasHeaderRow,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save");
      }

      toast.success(editingSupplier ? "Supplier updated" : "Supplier created");
      fetchSuppliers();
      resetForm();
    } catch (error: any) {
      toast.error(error.message || "Failed to save supplier");
    } finally {
      setSaving(false);
    }
  };

  const updateMapping = (column: number, field: string) => {
    setMappings((prev) =>
      prev.map((m) => (m.column === column ? { ...m, field } : m))
    );
  };

  const getFieldLabel = (fieldValue: string) => {
    return MAPPABLE_FIELDS.find((f) => f.value === fieldValue)?.label || fieldValue;
  };

  return (
    <div className="min-h-screen bg-stone-50 p-6">
      <Toaster position="top-right" />

      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              href="/admin"
              className="text-amber-600 hover:text-amber-700 text-sm mb-2 inline-block"
            >
              ← Back to Admin
            </Link>
            <h1 className="text-3xl font-bold text-stone-800">Manage Suppliers</h1>
            <p className="text-stone-600 mt-1">
              Configure how product sheets from different suppliers are imported
            </p>
          </div>
          {!showForm && (
            <Button
              onClick={() => setShowForm(true)}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              + Add Supplier
            </Button>
          )}
        </div>

        {/* Add/Edit Form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-stone-200 p-6 mb-8 shadow-sm">
            <h2 className="text-xl font-semibold text-stone-800 mb-4">
              {editingSupplier ? "Edit Supplier" : "Add New Supplier"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Supplier Name */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Supplier Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Supplier Name, ABC Tiles"
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  required
                />
              </div>

              {/* Column Count */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Number of Columns in Their Product Sheet
                </label>
                <input
                  type="number"
                  min={2}
                  max={15}
                  value={columnCount}
                  onChange={(e) => setColumnCount(parseInt(e.target.value) || 5)}
                  className="w-24 px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>

              {/* Column Mappings */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-3">
                  Map Each Column to a Field
                </label>
                <div className="grid gap-3">
                  {mappings.map((mapping) => (
                    <div
                      key={mapping.column}
                      className="flex items-center gap-4 bg-stone-50 p-3 rounded-lg"
                    >
                      <span className="w-24 text-sm font-medium text-stone-600">
                        Column {mapping.column}:
                      </span>
                      <select
                        value={mapping.field}
                        onChange={(e) => updateMapping(mapping.column, e.target.value)}
                        className="flex-1 px-3 py-2 border border-stone-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      >
                        {MAPPABLE_FIELDS.map((field) => (
                          <option key={field.value} value={field.value}>
                            {field.label}
                            {field.required ? " *" : ""}
                          </option>
                        ))}
                      </select>
                      {mapping.field !== "skip" && (
                        <span className="text-green-600 text-sm">✓ Mapped</span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-stone-500 mt-2">
                  * Product Code and Description are required
                </p>
              </div>

              {/* Start Row */}
              <div className="flex items-center gap-6">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Start Reading From Row
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={startRow}
                    onChange={(e) => setStartRow(parseInt(e.target.value) || 1)}
                    className="w-20 px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>
                <div className="flex items-center gap-2 mt-6">
                  <input
                    type="checkbox"
                    id="hasHeader"
                    checked={hasHeaderRow}
                    onChange={(e) => setHasHeaderRow(e.target.checked)}
                    className="w-4 h-4 text-amber-500 border-stone-300 rounded focus:ring-amber-500"
                  />
                  <label htmlFor="hasHeader" className="text-sm text-stone-700">
                    First row is a header (skip it)
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-stone-200">
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                >
                  {saving
                    ? "Saving..."
                    : editingSupplier
                    ? "Update Supplier"
                    : "Create Supplier"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Suppliers List */}
        {loading ? (
          <div className="text-center py-12 text-stone-500">Loading suppliers...</div>
        ) : suppliers.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-stone-200">
            <p className="text-stone-500 mb-4">No suppliers configured yet</p>
            {!showForm && (
              <Button
                onClick={() => setShowForm(true)}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                Add Your First Supplier
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            {suppliers.map((supplier) => (
              <div
                key={supplier.id}
                className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-stone-800">
                      {supplier.name}
                    </h3>
                    <p className="text-sm text-stone-500 mt-1">
                      {supplier.columnMappings.length} columns mapped • Starts at row{" "}
                      {supplier.startRow}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {supplier.columnMappings.map((m) => (
                        <span
                          key={m.column}
                          className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded"
                        >
                          Col {m.column} → {getFieldLabel(m.field)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(supplier)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDelete(supplier.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

