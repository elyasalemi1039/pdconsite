"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ApiProduct = {
  id: string;
  code: string;
  description: string;
  productDetails: string | null;
  imageUrl: string;
  area: { id: string; name: string };
  link: string | null;
  brand: string | null;
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

type Message = { type: "success" | "error" | "info"; text: string };

const API_BASE = "/api/admin/product-selection";

export default function ProductSheetApp() {
  const [message, setMessage] = useState<Message | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [parsingPdf, setParsingPdf] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [address, setAddress] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [contactName, setContactName] = useState("");
  const [company, setCompany] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");

  const [allProducts, setAllProducts] = useState<ApiProduct[]>([]);
  const [selected, setSelected] = useState<SelectedProduct[]>([]);
  const [downloadAsWord, setDownloadAsWord] = useState(false);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [pdfParseInfo, setPdfParseInfo] = useState<{
    found: number;
    notFound: string[];
  } | null>(null);

  // Load all products on mount
  useEffect(() => {
    const loadAllProducts = async () => {
      setLoadingProducts(true);
      try {
        const resp = await fetch("/api/admin/products?all=true");
        if (!resp.ok) {
          const errBody = await resp.json().catch(() => ({}));
          throw new Error(
            errBody?.error || errBody?.details || `Failed to fetch products (${resp.status})`
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

  // Group products by area
  const productsByArea = useMemo(() => {
    return allProducts.reduce<Record<string, ApiProduct[]>>((acc, p) => {
      const key = p.area?.name || "Other";
      acc[key] = acc[key] ? [...acc[key], p] : [p];
      return acc;
    }, {});
  }, [allProducts]);

  const areaNames = useMemo(() => Object.keys(productsByArea).sort(), [productsByArea]);

  const toggleArea = (areaName: string) => {
    setExpandedAreas((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(areaName)) {
        newSet.delete(areaName);
      } else {
        newSet.add(areaName);
      }
      return newSet;
    });
  };

  const addProductToSelected = useCallback((p: ApiProduct) => {
    setSelected((prev) => {
      const exists = prev.find((s) => s.id === p.id);
      if (exists) return prev;
      return [
        ...prev,
        {
          id: p.id,
          code: p.code,
          description: p.description,
          productDetails: p.productDetails,
          imageUrl: p.imageUrl,
          areaName: p.area?.name || "Other",
          quantity: "",
          notes: "",
          link: p.link,
        },
      ];
    });
  }, []);

  const removeFromSelected = (id: string) => {
    setSelected((prev) => prev.filter((s) => s.id !== id));
  };

  const updateSelected = (
    id: string,
    field: keyof Pick<SelectedProduct, "quantity" | "notes">,
    value: string
  ) => {
    setSelected((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  // PDF Upload Handler
  const handlePdfUpload = useCallback(
    async (file: File) => {
      if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
        setMessage({ type: "error", text: "Please upload a PDF file" });
        return;
      }

      setParsingPdf(true);
      setMessage(null);
      setPdfParseInfo(null);

      try {
        const formData = new FormData();
        formData.append("pdf", file);

        const res = await fetch(`${API_BASE}/parse-pdf`, {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          setMessage({ type: "error", text: data?.error || "Failed to parse PDF" });
          return;
        }

        if (!data.products || data.products.length === 0) {
          setMessage({
            type: "info",
            text: data.notFoundCodes?.length
              ? `No matching products found. Codes in PDF: ${data.extractedCodes?.join(", ") || "none"}`
              : "No product codes found in the PDF.",
          });
          return;
        }

        // Add matching products to selection
        for (const product of data.products) {
          addProductToSelected(product);
        }

        setPdfParseInfo({
          found: data.products.length,
          notFound: data.notFoundCodes || [],
        });

        setMessage({
          type: "success",
          text: `Added ${data.products.length} products from PDF${
            data.notFoundCodes?.length ? `. ${data.notFoundCodes.length} codes not found.` : ""
          }`,
        });
      } catch (err) {
        console.error("PDF parse error:", err);
        setMessage({ type: "error", text: "Failed to parse PDF" });
      } finally {
        setParsingPdf(false);
      }
    },
    [addProductToSelected]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handlePdfUpload(files[0]);
      }
    },
    [handlePdfUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handlePdfUpload(files[0]);
      }
      e.target.value = "";
    },
    [handlePdfUpload]
  );

  const validate = () => {
    if (!address.trim()) return "Address is required";
    if (selected.length === 0) return "Select at least one product";
    return null;
  };

  const buildPayloadProducts = () =>
    selected.map((p) => ({
      category: p.areaName,
      code: p.code,
      description: p.description,
      productDetails: p.productDetails,
      quantity: p.quantity,
      notes: p.notes,
      image: null,
      imageUrl: p.imageUrl,
      link: p.link || "",
    }));

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
      const format = downloadAsWord ? "docx" : "pdf";
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
          format,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || err.details || "Failed to generate file");
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);

      const addressInitials = address
        .trim()
        .split(/\s+/)
        .map((word) => word.charAt(0).toUpperCase())
        .filter((char) => /[A-Z]/.test(char))
        .join("");
      const dateObj = new Date(date);
      const dd = String(dateObj.getDate()).padStart(2, "0");
      const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
      const yyyy = dateObj.getFullYear();
      const formattedDate = `${dd}${mm}${yyyy}`;

      const a = document.createElement("a");
      a.href = url;
      a.download = `ProductSelection${addressInitials}${formattedDate}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({ type: "success", text: "Document generated and downloaded." });
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
    <main className="min-h-screen bg-[#2A2F38] py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">Admin</p>
            <h1 className="text-2xl font-semibold text-white">Product Selection</h1>
            <p className="text-sm text-slate-400">
              Select products to generate a selection document
            </p>
          </div>
          <a
            href="/admin"
            className="px-4 py-2 text-sm border border-slate-500 text-slate-300 rounded hover:bg-slate-700 transition-colors"
          >
            Back to Admin
          </a>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              message.type === "success"
                ? "bg-green-900/50 border border-green-700 text-green-300"
                : message.type === "info"
                ? "bg-blue-900/50 border border-blue-700 text-blue-300"
                : "bg-red-900/50 border border-red-700 text-red-300"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* PDF Upload Zone */}
        <div className="bg-[#36454f] rounded-xl border border-slate-600 p-6">
          <h2 className="text-lg font-semibold text-white mb-2">📄 Import from BWA PDF</h2>
          <p className="text-sm text-slate-400 mb-4">
            Upload a BWA quote/order PDF to automatically select matching products from your database.
          </p>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer ${
              isDragging
                ? "border-[#00f0ff] bg-[#00f0ff]/10"
                : "border-slate-500 hover:border-[#00f0ff]/60"
            } ${parsingPdf ? "opacity-60 pointer-events-none" : ""}`}
          >
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={parsingPdf}
            />
            <div className="flex flex-col items-center justify-center py-8 px-6">
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 ${
                  isDragging ? "bg-[#00f0ff]/20" : "bg-slate-600"
                }`}
              >
                {parsingPdf ? (
                  <svg className="w-7 h-7 text-[#00f0ff] animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <svg
                    className={`w-7 h-7 ${isDragging ? "text-[#00f0ff]" : "text-slate-400"}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                )}
              </div>
              <p className="text-base font-medium text-white mb-1">
                {parsingPdf ? "Extracting products..." : isDragging ? "Drop PDF here" : "Upload BWA PDF"}
              </p>
              <p className="text-sm text-slate-400 text-center">
                {parsingPdf ? "Matching product codes with database..." : "Drag and drop, or click to browse"}
              </p>
            </div>
          </div>

          {pdfParseInfo && pdfParseInfo.notFound.length > 0 && (
            <div className="mt-4 px-4 py-3 rounded-lg bg-amber-900/30 border border-amber-700/50">
              <p className="text-sm font-medium text-amber-400 mb-1">Codes not found in database:</p>
              <p className="text-xs text-amber-300/80">{pdfParseInfo.notFound.join(", ")}</p>
            </div>
          )}
        </div>

        {/* Document Details */}
        <div className="bg-[#36454f] rounded-xl border border-slate-600 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">📄 Document Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Address *</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Property address"
                className="w-full rounded-lg border border-slate-500 bg-slate-700 px-3 py-2 text-white placeholder-slate-400 focus:border-[#00f0ff] focus:ring-1 focus:ring-[#00f0ff] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-500 bg-slate-700 px-3 py-2 text-white focus:border-[#00f0ff] focus:ring-1 focus:ring-[#00f0ff] outline-none"
              />
            </div>
          </div>
        </div>

        {/* Client Details */}
        <div className="bg-[#36454f] rounded-xl border border-slate-600 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">👤 Client Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Contact Name</label>
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="John Smith"
                className="w-full rounded-lg border border-slate-500 bg-slate-700 px-3 py-2 text-white placeholder-slate-400 focus:border-[#00f0ff] focus:ring-1 focus:ring-[#00f0ff] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Company</label>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Company name"
                className="w-full rounded-lg border border-slate-500 bg-slate-700 px-3 py-2 text-white placeholder-slate-400 focus:border-[#00f0ff] focus:ring-1 focus:ring-[#00f0ff] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Phone</label>
              <input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="0400 000 000"
                className="w-full rounded-lg border border-slate-500 bg-slate-700 px-3 py-2 text-white placeholder-slate-400 focus:border-[#00f0ff] focus:ring-1 focus:ring-[#00f0ff] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                className="w-full rounded-lg border border-slate-500 bg-slate-700 px-3 py-2 text-white placeholder-slate-400 focus:border-[#00f0ff] focus:ring-1 focus:ring-[#00f0ff] outline-none"
              />
            </div>
          </div>
        </div>

        {/* Area Dropdowns */}
        <div className="bg-[#36454f] rounded-xl border border-slate-600 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">📦 Select Products by Area</h2>
            <span className="text-sm text-slate-400">{allProducts.length} products available</span>
          </div>

          {loadingProducts ? (
            <div className="text-center py-8 text-slate-400">Loading products...</div>
          ) : areaNames.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No products found</div>
          ) : (
            <div className="space-y-3">
              {areaNames.map((areaName) => {
                const isExpanded = expandedAreas.has(areaName);
                const areaProducts = productsByArea[areaName] || [];
                const selectedInArea = areaProducts.filter((p) =>
                  selected.some((s) => s.id === p.id)
                ).length;

                return (
                  <div key={areaName} className="border border-slate-500 rounded-lg overflow-hidden">
                    {/* Area Header */}
                    <button
                      onClick={() => toggleArea(areaName)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-700 hover:bg-slate-600 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <svg
                          className={`w-5 h-5 text-slate-400 transition-transform ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-white font-medium">{areaName}</span>
                        <span className="text-sm text-slate-400">({areaProducts.length} products)</span>
                      </div>
                      {selectedInArea > 0 && (
                        <span className="bg-[#00f0ff] text-[#36454f] text-xs font-bold px-2 py-1 rounded">
                          {selectedInArea} selected
                        </span>
                      )}
                    </button>

                    {/* Area Products */}
                    {isExpanded && (
                      <div className="bg-slate-800 p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {areaProducts.map((product) => {
                          const isSelected = selected.some((s) => s.id === product.id);
                          return (
                            <div
                              key={product.id}
                              className={`rounded-lg border-2 overflow-hidden transition-all ${
                                isSelected
                                  ? "border-[#00f0ff] bg-[#00f0ff]/10"
                                  : "border-slate-600 bg-slate-700 hover:border-slate-500"
                              }`}
                            >
                              {/* Product Image */}
                              <div className="aspect-video bg-slate-600 relative overflow-hidden">
                                <img
                                  src={product.imageUrl || "/no-image.png"}
                                  alt={product.description}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = "/no-image.png";
                                  }}
                                />
                                {isSelected && (
                                  <div className="absolute top-2 right-2 bg-[#00f0ff] text-[#36454f] p-1 rounded-full">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                      <path
                                        fillRule="evenodd"
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  </div>
                                )}
                              </div>

                              {/* Product Info */}
                              <div className="p-3">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <span className="bg-slate-600 text-white text-xs font-bold px-2 py-1 rounded">
                                    {product.code}
                                  </span>
                                  {product.brand && (
                                    <span className="text-xs text-slate-400">{product.brand}</span>
                                  )}
                                </div>
                                <p className="text-sm text-white mb-2 line-clamp-2">{product.description}</p>
                                {product.productDetails && (
                                  <p className="text-xs text-slate-400 mb-3 line-clamp-2">
                                    {product.productDetails}
                                  </p>
                                )}
                                <button
                                  onClick={() =>
                                    isSelected ? removeFromSelected(product.id) : addProductToSelected(product)
                                  }
                                  className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                                    isSelected
                                      ? "bg-red-600 hover:bg-red-700 text-white"
                                      : "bg-[#00f0ff] hover:bg-[#00d4e0] text-[#36454f]"
                                  }`}
                                >
                                  {isSelected ? "Remove" : "Add to Selection"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Products */}
        {selected.length > 0 && (
          <div className="bg-[#36454f] rounded-xl border border-slate-600 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">✅ Selected Products ({selected.length})</h2>
              <button
                onClick={() => setSelected([])}
                className="text-sm text-red-400 hover:text-red-300"
              >
                Clear All
              </button>
            </div>

            <div className="space-y-4">
              {selected.map((item) => (
                <div key={item.id} className="bg-slate-700 rounded-lg p-4 border border-slate-600">
                  <div className="flex items-start gap-4">
                    {/* Thumbnail */}
                    <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-slate-600">
                      <img
                        src={item.imageUrl || "/no-image.png"}
                        alt={item.description}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/no-image.png";
                        }}
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-slate-600 text-white text-xs font-bold px-2 py-1 rounded">
                          {item.code}
                        </span>
                        <span className="text-xs text-slate-400">{item.areaName}</span>
                      </div>
                      <p className="text-sm text-white truncate">{item.description}</p>
                    </div>

                    {/* Remove Button */}
                    <button
                      onClick={() => removeFromSelected(item.id)}
                      className="text-red-400 hover:text-red-300 p-1"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Qty and Notes */}
                  <div className="mt-3 grid grid-cols-[100px_1fr] gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Quantity</label>
                      <input
                        type="text"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => updateSelected(item.id, "quantity", e.target.value)}
                        className="w-full rounded-lg border border-slate-500 bg-slate-600 px-3 py-2 text-white text-sm placeholder-slate-400 focus:border-[#00f0ff] focus:ring-1 focus:ring-[#00f0ff] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Notes</label>
                      <textarea
                        placeholder="Additional notes..."
                        value={item.notes}
                        onChange={(e) => updateSelected(item.id, "notes", e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-slate-500 bg-slate-600 px-3 py-2 text-white text-sm placeholder-slate-400 focus:border-[#00f0ff] focus:ring-1 focus:ring-[#00f0ff] outline-none resize-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generate Button */}
        <div className="flex items-center justify-end gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={downloadAsWord}
              onChange={(e) => setDownloadAsWord(e.target.checked)}
              className="w-4 h-4 rounded border-slate-500 bg-slate-700 text-[#00f0ff] focus:ring-[#00f0ff]"
            />
            <span className="text-sm text-slate-300">Download as Word (.docx)</span>
          </label>
          <button
            onClick={generateDocument}
            disabled={generating}
            className="px-6 py-3 rounded-lg bg-[#00f0ff] hover:bg-[#00d4e0] text-[#36454f] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? "⏳ Generating..." : `📥 Generate ${downloadAsWord ? "Word" : "PDF"}`}
          </button>
        </div>
      </div>
    </main>
  );
}
