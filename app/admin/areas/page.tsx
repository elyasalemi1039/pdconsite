"use client";

import { useEffect, useState } from "react";
import toast, { Toaster } from "react-hot-toast";

type Area = { id: string; name: string };

export default function AreasPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const loadAreas = async () => {
    try {
      const res = await fetch("/api/admin/areas", { cache: "no-store" });
      const data = await res.json();
      setAreas(data.areas || []);
    } catch {
      toast.error("Failed to load areas");
    }
  };

  useEffect(() => {
    loadAreas();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to create area");
      } else {
        toast.success("Area created");
        setName("");
        loadAreas();
      }
    } catch {
      toast.error("Failed to create area");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (area: Area) => {
    setEditingId(area.id);
    setEditName(area.name);
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
      const res = await fetch(`/api/admin/areas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to update");
      } else {
        toast.success("Area updated");
        setEditingId(null);
        loadAreas();
      }
    } catch {
      toast.error("Failed to update area");
    }
  };

  const handleDelete = async (id: string, areaName: string) => {
    if (!confirm(`Delete "${areaName}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/admin/areas/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to delete");
      } else {
        toast.success("Area deleted");
        loadAreas();
      }
    } catch {
      toast.error("Failed to delete area");
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4">
      <Toaster />
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">Manage Areas</h1>
          <a
            href="/admin"
            className="text-sm text-blue-600 hover:underline"
          >
            ← Back to Admin
          </a>
        </div>

        {/* Add New Area */}
        <form
          onSubmit={handleAdd}
          className="bg-white border border-slate-200 rounded-lg p-3 flex gap-2"
        >
          <input
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            placeholder="New area name (e.g. Kitchen, Bathroom)"
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

        {/* Areas List */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {areas.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-500 text-sm">
              No areas yet. Add one above.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {areas.map((a) => (
                <li key={a.id} className="px-4 py-3 flex items-center gap-3">
                  {editingId === a.id ? (
                    <>
                      <input
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:ring-2 focus:ring-amber-500"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(a.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                      <button
                        onClick={() => saveEdit(a.id)}
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
                      <span className="flex-1 text-sm text-slate-800">{a.name}</span>
                      <button
                        onClick={() => startEdit(a)}
                        className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(a.id, a.name)}
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
          Note: Areas with products cannot be deleted. Remove or reassign products first.
        </p>
      </div>
    </main>
  );
}
