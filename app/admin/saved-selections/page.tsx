"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SavedSelection = {
  id: string;
  name: string;
  address: string;
  date: string;
  contactName: string | null;
  company: string | null;
  phoneNumber: string | null;
  email: string | null;
  products: Array<{
    id: string;
    code: string;
    areaName: string;
    description: string;
  }>;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export default function SavedSelectionsPage() {
  const [selections, setSelections] = useState<SavedSelection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchSelections = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/saved-selections");
      if (!res.ok) {
        throw new Error("Failed to fetch saved selections");
      }
      const data = await res.json();
      setSelections(data.selections || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load selections");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSelections();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this selection?")) return;
    
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/saved-selections/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to delete selection");
      }
      setSelections((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-AU", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 py-16 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Admin</p>
            <h1 className="text-2xl font-semibold text-slate-900">Saved Selections</h1>
            <p className="text-sm text-slate-500">
              Continue working on previously saved product selections
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/product-selection"
              className="px-4 py-2 text-sm bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors"
            >
              + New Selection
            </Link>
            <Link
              href="/admin"
              className="px-4 py-2 text-sm border border-slate-300 rounded hover:bg-white transition-colors"
            >
              Back to Admin
            </Link>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-100 border border-red-300 text-red-800 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-8 text-center text-slate-500">
            Loading saved selections...
          </div>
        )}

        {/* Empty State */}
        {!loading && selections.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-8 text-center">
            <p className="text-slate-500 mb-4">No saved selections yet</p>
            <Link
              href="/admin/product-selection"
              className="inline-block px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors"
            >
              Create Your First Selection
            </Link>
          </div>
        )}

        {/* Selections Grid */}
        {!loading && selections.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {selections.map((selection) => (
              <div
                key={selection.id}
                className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Card Header */}
                <div className="p-4 border-b border-slate-100">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-slate-900 truncate">
                        {selection.name}
                      </h3>
                      <p className="text-sm text-slate-500 truncate">
                        {selection.address}
                      </p>
                    </div>
                    <span
                      className={`flex-shrink-0 text-xs font-medium px-2 py-1 rounded ${
                        selection.status === "completed"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {selection.status === "completed" ? "Completed" : "Draft"}
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span>📅</span>
                    <span>Date: {formatDate(selection.date)}</span>
                  </div>
                  {selection.contactName && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <span>👤</span>
                      <span className="truncate">{selection.contactName}</span>
                    </div>
                  )}
                  {selection.company && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <span>🏢</span>
                      <span className="truncate">{selection.company}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span>📦</span>
                    <span>{Array.isArray(selection.products) ? selection.products.length : 0} products</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Last updated: {formatDate(selection.updatedAt)}</span>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
                  <Link
                    href={`/admin/product-selection?continue=${selection.id}`}
                    className="flex-1 text-center px-3 py-2 bg-amber-500 text-white text-sm font-medium rounded hover:bg-amber-600 transition-colors"
                  >
                    Continue Selection
                  </Link>
                  <button
                    onClick={() => handleDelete(selection.id)}
                    disabled={deleting === selection.id}
                    className="px-3 py-2 text-red-600 text-sm font-medium rounded border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {deleting === selection.id ? "..." : "🗑"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}






