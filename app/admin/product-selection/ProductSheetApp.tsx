"use client";

import { useEffect, useMemo, useState } from "react";

type ApiProduct = {
  id: string;
  code: string;
  description: string;
  productDetails: string | null;
  imageUrl: string;
  area: { id: string; name: string };
  link: string | null;
  brand: string | null;
  nickname: string | null;
  keywords: string | null;
};

type SelectedProduct = {
  id: string;
  code: string;
  areaName: string;
  description: string;
  productDetails: string | null;
  imageUrl: string;
  quantity: string;
  notes: string;
  link: string | null;
};

type Message = { type: "success" | "error"; text: string };

const API_BASE = "/api/admin/product-selection";

export default function ProductSheetApp() {
  const [message, setMessage] = useState<Message | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [address, setAddress] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [contactName, setContactName] = useState("");
  const [company, setCompany] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");

  const [search, setSearch] = useState("");
  const [allProducts, setAllProducts] = useState<ApiProduct[]>([]);
  const [selected, setSelected] = useState<SelectedProduct[]>([]);

  // Load all products on mount
  useEffect(() => {
    const loadAllProducts = async () => {
      setLoadingProducts(true);
      try {
        const resp = await fetch("/api/admin/products?all=true");
        if (!resp.ok) {
          const errBody = await resp.json().catch(() => ({}));
          throw new Error(
            errBody?.error ||
              errBody?.details ||
              `Failed to fetch products (${resp.status})`
          );
        }
        const data = await resp.json();
        setAllProducts(data.products || []);
      } catch (err) {
        setMessage({
          type: "error",
          text: err instanceof Error ? err.message : "Failed to fetch products",
        });
      } finally {
        setLoadingProducts(false);
      }
    };
    loadAllProducts();
  }, []);

  // Instant client-side filtering
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return allProducts.filter((p) => {
      const codeMatch = p.code.toLowerCase().includes(q);
      const descMatch = p.description.toLowerCase().includes(q);
      const brandMatch = p.brand?.toLowerCase().includes(q) || false;
      const nicknameMatch = p.nickname?.toLowerCase().includes(q) || false;
      const keywordsMatch = p.keywords?.toLowerCase().includes(q) || false;
      return codeMatch || descMatch || brandMatch || nicknameMatch || keywordsMatch;
    });
  }, [allProducts, search]);

  const productsByArea = useMemo(() => {
    return filteredProducts.reduce<Record<string, ApiProduct[]>>((acc, p) => {
      const key = p.area?.name || "Other";
      acc[key] = acc[key] ? [...acc[key], p] : [p];
      return acc;
    }, {});
  }, [filteredProducts]);

  const toggleSelect = (p: ApiProduct | SelectedProduct) => {
    const areaName =
      "area" in p ? (p.area?.name || "Other") : p.areaName || "Other";
    const id = p.id;
    setSelected((prev) => {
      const exists = prev.find((s) => s.id === id);
      if (exists) {
        return prev.filter((s) => s.id !== id);
      }
      const link = "link" in p ? p.link : null;
      return [
        ...prev,
        {
          id: p.id,
          code: p.code,
          description: p.description,
          productDetails: p.productDetails,
          imageUrl: p.imageUrl,
          areaName,
          quantity: "",
          notes: "",
          link,
        },
      ];
    });
  };


  const updateSelected = (
    id: string,
    field: keyof Pick<SelectedProduct, "quantity" | "notes">,
    value: string
  ) => {
    setSelected((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const validate = () => {
    if (!address.trim()) return "Address is required";
    if (selected.length === 0) return "Select at least one product";
    return null;
  };

  const buildPayloadProducts = () =>
    selected.map((p) => {
      return {
        category: p.areaName,
        code: p.code,
        description: p.description,
        productDetails: p.productDetails,
        quantity: p.quantity,
        notes: p.notes,
        image: null,
        imageUrl: p.imageUrl,
        link: p.link || "",
      };
    });

  const generateDocument = async () => {
    const error = validate();
    if (error) {
      setMessage({ type: "error", text: error });
      return;
    }

    setGenerating(true);
    setMessage(null);

    try {
      const payloadProducts = buildPayloadProducts();
      const resp = await fetch(`${API_BASE}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          address: address.trim(),
          date,
          contactName: contactName.trim(),
          company: company.trim(),
          phoneNumber: phoneNumber.trim(),
          email: email.trim(),
          products: payloadProducts,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || err.details || "Failed to generate file");
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Product_Selection_${address.replace(/\s+/g, "_")}_${date}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({
        type: "success",
        text: "Document generated and downloaded.",
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to generate file",
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <div className="container">
        <h1>Product Selection Generator</h1>
        <p className="subtitle">Generate product selection documents</p>

        {message && (
          <div
            className="card"
            style={{
              background: message.type === "success" ? "#d4edda" : "#f8d7da",
              border: `1px solid ${
                message.type === "success" ? "#c3e6cb" : "#f5c6cb"
              }`,
              color: message.type === "success" ? "#155724" : "#721c24",
            }}
          >
            {message.text}
          </div>
        )}

        <div className="card">
          <h2 className="card-title">Document Details</h2>
          <div className="grid">
            <div className="field">
              <label>Address *</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Property address"
              />
            </div>
            <div className="field">
              <label>Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">👤 Client Details</h2>
          <div className="grid">
            <div className="field">
              <label>Contact Name</label>
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="John Smith"
              />
            </div>
            <div className="field">
              <label>Company</label>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Company name"
              />
            </div>
            <div className="field">
              <label>Phone</label>
              <input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="0400 000 000"
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="card-title" style={{ margin: 0 }}>
              Products from database ({allProducts.length} loaded)
            </h2>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by code or keywords..."
                style={{ minWidth: "280px" }}
              />
            </div>
          </div>

          {loadingProducts && <p className="text-sm text-gray-500">Loading products...</p>}

          {!loadingProducts && !search.trim() && (
            <p className="text-sm text-gray-500">Start typing to search products...</p>
          )}

          {!loadingProducts && filteredProducts.length === 0 && search.trim() && (
            <p className="text-sm text-gray-500">No products found for "{search}".</p>
          )}

          {Object.keys(productsByArea).map((area) => (
            <div key={area} className="product-card">
              <div className="product-header">
                <span className="product-title">{area}</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {productsByArea[area].map((product) => {
                  const isSelected = selected.some((s) => s.id === product.id);
                  return (
                    <div
                      key={product.id}
                      className="flex items-center justify-between border border-slate-200 rounded px-3 py-2 text-sm"
                    >
                      <div className="flex-1 min-w-0 font-semibold text-slate-800">
                        {product.code}
                      </div>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => toggleSelect(product)}
                      >
                        {isSelected ? "Remove" : "Add"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {selected.length > 0 && (
          <div className="card">
            <h2 className="card-title">✅ Selected products ({selected.length})</h2>
            <div className="selected-products-list">
              {selected.map((item) => (
                <div
                  key={item.id}
                  className="selected-product-item"
                >
                  <div className="selected-product-header">
                    <div className="selected-product-info">
                      <span className="selected-product-code">{item.code}</span>
                      <span className="selected-product-desc">{item.description}</span>
                    </div>
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => toggleSelect(item)}
                    >
                      ✕ Remove
                    </button>
                  </div>
                  <div className="selected-product-fields-simple">
                    <div className="field-group field-small">
                      <label>Qty</label>
                      <input
                        type="text"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => updateSelected(item.id, "quantity", e.target.value)}
                      />
                    </div>
                    <div className="field-group field-notes-tall">
                      <label>Notes</label>
                      <textarea
                        placeholder="Additional notes... (supports line breaks)"
                        value={item.notes}
                        onChange={(e) => updateSelected(item.id, "notes", e.target.value)}
                        rows={3}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            className="btn-primary"
            onClick={generateDocument}
            disabled={generating}
            style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}
          >
            {generating ? "⏳ Generating..." : "📥 Generate Document"}
          </button>
        </div>
      </div>

      <style jsx global>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            Oxygen, Ubuntu, sans-serif;
          background: #f5f5f5;
          color: #333;
          line-height: 1.5;
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
        }

        h1 {
          font-size: 1.75rem;
          margin-bottom: 0.5rem;
        }

        .subtitle {
          color: #666;
          margin-bottom: 2rem;
        }

        .card {
          background: white;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }

        .card-title {
          font-size: 1.1rem;
          font-weight: 600;
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .grid-3 {
          grid-template-columns: repeat(3, 1fr);
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .field.span-2 {
          grid-column: span 2;
        }

        .field.span-3 {
          grid-column: span 3;
        }

        label {
          font-size: 0.875rem;
          font-weight: 500;
          color: #555;
        }

        input,
        select,
        textarea {
          padding: 0.5rem 0.75rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 0.875rem;
          width: 100%;
        }

        input:focus,
        select:focus,
        textarea:focus {
          outline: none;
          border-color: #0066cc;
          box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.1);
        }

        textarea {
          resize: vertical;
          min-height: 60px;
        }

        button {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 4px;
          font-size: 0.875rem;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }

        .btn-primary {
          background: #0066cc;
          color: white;
        }

        .btn-primary:hover {
          background: #0052a3;
        }

        .btn-primary:disabled {
          background: #999;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: #e0e0e0;
          color: #333;
        }

        .btn-secondary:hover {
          background: #d0d0d0;
        }

        .btn-danger {
          background: #dc3545;
          color: white;
        }

        .btn-danger:hover {
          background: #c82333;
        }

        .btn-sm {
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
        }

        .product-card {
          background: #fafafa;
          border: 1px solid #eee;
          border-radius: 6px;
          padding: 1rem;
          margin-bottom: 1rem;
        }

        .product-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .product-title {
          font-weight: 600;
        }

        .flex {
          display: flex;
        }

        .items-center {
          align-items: center;
        }

        .justify-between {
          justify-content: space-between;
        }

        .justify-end {
          justify-content: flex-end;
        }

        .gap-2 {
          gap: 0.5rem;
        }

        .gap-4 {
          gap: 1rem;
        }

        .mb-4 {
          margin-bottom: 1rem;
        }

        .image-preview {
          width: 60px;
          height: 60px;
          object-fit: cover;
          border-radius: 4px;
          border: 1px solid #ddd;
        }

        .image-placeholder {
          width: 60px;
          height: 60px;
          border: 2px dashed #ddd;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #999;
          font-size: 1.5rem;
        }

        .summary {
          background: #e8f5e9;
          border: 1px solid #c8e6c9;
        }

        .summary-list {
          list-style: none;
        }

        .summary-list li {
          padding: 0.25rem 0;
        }

        .selected-products-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .selected-product-item {
          background: #fafafa;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 1rem;
        }

        .selected-product-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.75rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid #e2e8f0;
        }

        .selected-product-info {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.75rem;
        }

        .selected-product-code {
          font-weight: 700;
          font-size: 1rem;
          color: #1e293b;
          background: #e2e8f0;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
        }

        .selected-product-desc {
          color: #475569;
          font-size: 0.875rem;
        }

        .selected-product-original-price {
          color: #64748b;
          font-size: 0.75rem;
          background: #f1f5f9;
          padding: 0.125rem 0.375rem;
          border-radius: 3px;
        }

        .selected-product-fields-simple {
          display: grid;
          grid-template-columns: 80px 1fr;
          gap: 0.75rem;
          align-items: start;
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .field-group label {
          font-size: 0.75rem;
          font-weight: 500;
          color: #64748b;
        }

        .field-group input,
        .field-group textarea {
          padding: 0.5rem 0.75rem;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          font-size: 0.875rem;
          width: 100%;
        }

        .field-group input:focus,
        .field-group textarea:focus {
          outline: none;
          border-color: #0066cc;
          box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.1);
        }

        .field-small {
          min-width: 80px;
          max-width: 80px;
        }

        .field-notes-tall {
          flex: 1;
        }

        .field-notes-tall textarea {
          min-height: 80px;
          resize: vertical;
          font-family: inherit;
          line-height: 1.5;
        }

        @media (max-width: 768px) {
          .grid-3 {
            grid-template-columns: 1fr;
          }
          .field.span-2,
          .field.span-3 {
            grid-column: span 1;
          }
          .selected-product-fields {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>
    </>
  );
}

