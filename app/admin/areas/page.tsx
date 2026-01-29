"use client";

import { useEffect, useState } from "react";
import toast, { Toaster } from "react-hot-toast";

type Area = { id: string; name: string };

export default function AreasPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <main className="min-h-screen bg-slate-50 py-16 px-4">
      <Toaster />
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">Areas</h1>
          <a
            href="/admin"
            className="px-4 py-2 text-sm border border-slate-300 rounded hover:bg-white"
          >
            Back to Admin
          </a>
        </div>

        <form
          onSubmit={handleAdd}
          className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 flex gap-3"
        >
          <input
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            placeholder="New area name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="submit"
            className="rounded-md bg-amber-500 text-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
            disabled={loading || !name.trim()}
          >
            Add
          </button>
        </form>

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
          <ul className="divide-y divide-slate-100">
            {areas.map((a) => (
              <li key={a.id} className="px-4 py-3 text-sm text-slate-800">
                {a.name}
              </li>
            ))}
            {areas.length === 0 && (
              <li className="px-4 py-3 text-sm text-slate-500">
                No areas yet. Add one above.
              </li>
            )}
          </ul>
        </div>
      </div>
    </main>
  );
}

