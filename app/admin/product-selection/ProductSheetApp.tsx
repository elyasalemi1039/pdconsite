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
    suggestedMatches: Record<string, Array<{ id: string; code: string; description: string; matchType: string }>>;
  } | null>(null);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>("all");
  const [selectedBrandFilter, setSelectedBrandFilter] = useState<string>("all");

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

  // Get unique area names for filter
  const areaNames = useMemo(() => {
    const areas = new Set<string>();
    allProducts.forEach((p) => areas.add(p.area?.name || "Other"));
    return Array.from(areas).sort();
  }, [allProducts]);

  // Get unique brand names for filter
  const brandNames = useMemo(() => {
    const brands = new Set<string>();
    allProducts.forEach((p) => {
      if (p.brand) brands.add(p.brand);
    });
    return Array.from(brands).sort();
  }, [allProducts]);

  // Filter and search products
  const filteredProducts = useMemo(() => {
    let products = allProducts;

    // Apply area filter
    if (selectedAreaFilter !== "all") {
      products = products.filter((p) => (p.area?.name || "Other") === selectedAreaFilter);
    }

    // Apply brand filter
    if (selectedBrandFilter !== "all") {
      products = products.filter((p) => p.brand === selectedBrandFilter);
    }

    // Apply search across ALL fields
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      products = products.filter((p) => {
        const codeMatch = p.code.toLowerCase().includes(q);
        const descMatch = p.description.toLowerCase().includes(q);
        const brandMatch = p.brand?.toLowerCase().includes(q) || false;
        const keywordsMatch = p.keywords?.toLowerCase().includes(q) || false;
        const detailsMatch = p.productDetails?.toLowerCase().includes(q) || false;
        const areaMatch = p.area?.name.toLowerCase().includes(q) || false;
        return codeMatch || descMatch || brandMatch || keywordsMatch || detailsMatch || areaMatch;
      });
    }

    return products;
  }, [allProducts, searchQuery, selectedAreaFilter, selectedBrandFilter]);

  // Group filtered products by area
  const productsByArea = useMemo(() => {
    return filteredProducts.reduce<Record<string, ApiProduct[]>>((acc, p) => {
      const key = p.area?.name || "Other";
      acc[key] = acc[key] ? [...acc[key], p] : [p];
      return acc;
    }, {});
  }, [filteredProducts]);

  const filteredAreaNames = useMemo(() => Object.keys(productsByArea).sort(), [productsByArea]);

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
    field: keyof Pick<SelectedProduct, "quantity" | "notes" | "description">,
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

        // Store parse info including suggested matches
        setPdfParseInfo({
          found: data.products?.length || 0,
          notFound: data.notFoundCodes || [],
          suggestedMatches: data.suggestedMatches || {},
        });

        if (!data.products || data.products.length === 0) {
          const hasSuggestions = Object.keys(data.suggestedMatches || {}).length > 0;
          setMessage({
            type: hasSuggestions ? "info" : "error",
            text: data.notFoundCodes?.length
              ? `No exact matches found. Codes in PDF: ${data.extractedCodes?.join(", ") || "none"}${hasSuggestions ? ". See suggestions below." : ""}`
              : "No product codes found in the PDF.",
          });
          return;
        }

        // Add matching products to selection
        for (const product of data.products) {
          addProductToSelected(product);
        }

        const hasSuggestions = Object.keys(data.suggestedMatches || {}).length > 0;
        setMessage({
          type: "success",
          text: `Added ${data.products.length} products from PDF${
            data.notFoundCodes?.length ? `. ${data.notFoundCodes.length} codes not found${hasSuggestions ? " (see suggestions below)" : ""}.` : ""
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

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedAreaFilter("all");
    setSelectedBrandFilter("all");
  };

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

  const hasActiveFilters = searchQuery.trim() || selectedAreaFilter !== "all" || selectedBrandFilter !== "all";

  return (
    <main className="min-h-screen bg-slate-50 py-16 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Admin</p>
            <h1 className="text-2xl font-semibold text-slate-900">Product Selection</h1>
            <p className="text-sm text-slate-500">
              Select products to generate a selection document
            </p>
          </div>
          <a
            href="/admin"
            className="px-4 py-2 text-sm border border-slate-300 rounded hover:bg-white"
          >
            Back to Admin
          </a>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              message.type === "success"
                ? "bg-green-100 border border-green-300 text-green-800"
                : message.type === "info"
                ? "bg-blue-100 border border-blue-300 text-blue-800"
                : "bg-red-100 border border-red-300 text-red-800"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* PDF Upload Zone */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">📄 Import from BWA PDF</h2>
          <p className="text-sm text-slate-600 mb-4">
            Upload a BWA quote/order PDF to automatically select matching products from your database.
          </p>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative rounded-lg border-2 border-dashed transition-all duration-200 cursor-pointer ${
              isDragging
                ? "border-amber-500 bg-amber-50"
                : "border-slate-300 hover:border-amber-400"
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
                className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${
                  isDragging ? "bg-amber-100" : "bg-slate-100"
                }`}
              >
                {parsingPdf ? (
                  <svg className="w-6 h-6 text-amber-500 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <svg
                    className={`w-6 h-6 ${isDragging ? "text-amber-500" : "text-slate-400"}`}
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
              <p className="text-sm font-medium text-slate-700 mb-1">
                {parsingPdf ? "Extracting products..." : isDragging ? "Drop PDF here" : "Upload BWA PDF"}
              </p>
              <p className="text-xs text-slate-500 text-center">
                {parsingPdf ? "Matching product codes with database..." : "Drag and drop, or click to browse"}
              </p>
            </div>
          </div>

          {pdfParseInfo && pdfParseInfo.notFound.length > 0 && (
            <div className="mt-4 space-y-3">
              {pdfParseInfo.notFound.map((code) => {
                const suggestions = pdfParseInfo.suggestedMatches[code] || [];
                return (
                  <div key={code} className="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
                    <p className="text-sm font-medium text-amber-700 mb-2">
                      Code not found: <span className="font-bold">{code}</span>
                    </p>
                    {suggestions.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs text-amber-600">Did you mean:</p>
                        <div className="flex flex-wrap gap-2">
                          {suggestions.map((suggestion) => (
                            <button
                              key={suggestion.id}
                              onClick={() => {
                                const product = allProducts.find((p) => p.id === suggestion.id);
                                if (product) addProductToSelected(product);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-amber-300 rounded text-xs hover:bg-amber-100 transition-colors"
                            >
                              <span className="font-medium text-amber-800">{suggestion.code}</span>
                              <span className="text-amber-600">({suggestion.matchType})</span>
                              <span className="text-green-600 font-bold">+</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600">No similar products found</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Document Details */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">📄 Document Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Address *</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Property address"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Client Details */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">👤 Client Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contact Name</label>
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="John Smith"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Company</label>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Company name"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="0400 000 000"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">🔍 Search & Filter Products</h2>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-amber-600 hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search Input */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Search (code, description, brand, keywords)
              </label>
            <input
              type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type to search..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>

            {/* Area Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Area</label>
              <select
                value={selectedAreaFilter}
                onChange={(e) => setSelectedAreaFilter(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              >
                <option value="all">All Areas</option>
                {areaNames.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </div>

            {/* Brand Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Brand</label>
              <select
                value={selectedBrandFilter}
                onChange={(e) => setSelectedBrandFilter(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              >
                <option value="all">All Brands</option>
                {brandNames.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-xs text-slate-500 mt-2">
            Showing {filteredProducts.length} of {allProducts.length} products
          </p>
        </div>

        {/* Area Dropdowns */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">📦 Select Products by Area</h2>

          {loadingProducts ? (
            <div className="text-center py-8 text-slate-500">Loading products...</div>
          ) : filteredAreaNames.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              {hasActiveFilters ? "No products match your filters" : "No products found"}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAreaNames.map((areaName) => {
                const isExpanded = expandedAreas.has(areaName);
                const areaProducts = productsByArea[areaName] || [];
                const selectedInArea = areaProducts.filter((p) =>
                  selected.some((s) => s.id === p.id)
                ).length;

                return (
                  <div key={areaName} className="border border-slate-200 rounded-lg overflow-hidden">
                    {/* Area Header */}
                    <button
                      onClick={() => toggleArea(areaName)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <svg
                          className={`w-4 h-4 text-slate-500 transition-transform ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-slate-900 font-medium">{areaName}</span>
                        <span className="text-sm text-slate-500">({areaProducts.length} products)</span>
                      </div>
                      {selectedInArea > 0 && (
                        <span className="bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded">
                          {selectedInArea} selected
                        </span>
                      )}
                    </button>

                    {/* Area Products */}
                    {isExpanded && (
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-white">
                        {areaProducts.map((product) => {
                  const isSelected = selected.some((s) => s.id === product.id);
                  return (
                    <div
                      key={product.id}
                              className={`rounded-lg border-2 overflow-hidden transition-all ${
                                isSelected
                                  ? "border-amber-500 bg-amber-50"
                                  : "border-slate-200 hover:border-slate-300"
                              }`}
                            >
                              {/* Product Image */}
                              <div className="aspect-video bg-slate-100 relative overflow-hidden">
                                <img
                                  src={product.imageUrl || "/no-image.png"}
                                  alt={product.description}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = "/no-image.png";
                                  }}
                                />
                                {isSelected && (
                                  <div className="absolute top-2 right-2 bg-amber-500 text-white p-1 rounded-full">
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
                                  <span className="bg-slate-200 text-slate-800 text-xs font-bold px-2 py-1 rounded">
                          {product.code}
                                  </span>
                                  {product.brand && (
                                    <span className="text-xs text-slate-500">{product.brand}</span>
                                  )}
                        </div>
                                <p className="text-sm text-slate-800 mb-2 line-clamp-2">{product.description}</p>
                                {product.productDetails && (
                                  <p className="text-xs text-slate-500 mb-3 line-clamp-2">
                                    {product.productDetails}
                                  </p>
                                )}
                                <button
                                  onClick={() =>
                                    isSelected ? removeFromSelected(product.id) : addProductToSelected(product)
                                  }
                                  className={`w-full py-2 rounded-md text-sm font-medium transition-colors ${
                                    isSelected
                                      ? "bg-red-500 hover:bg-red-600 text-white"
                                      : "bg-amber-500 hover:bg-amber-600 text-white"
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
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">✅ Selected Products ({selected.length})</h2>
              <button
                onClick={() => setSelected([])}
                className="text-sm text-red-500 hover:underline"
              >
                Clear All
              </button>
            </div>

            <div className="space-y-4">
              {selected.map((item) => (
                <div key={item.id} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="flex items-start gap-4">
                    {/* Thumbnail */}
                    <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-slate-200">
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
                        <span className="bg-slate-200 text-slate-800 text-xs font-bold px-2 py-1 rounded">
                    {item.code}
                        </span>
                        <span className="text-xs text-slate-500">{item.areaName}</span>
                      </div>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateSelected(item.id, "description", e.target.value)}
                        className="w-full text-sm text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-amber-500 focus:outline-none py-0.5 transition-colors"
                        title="Click to edit description"
                      />
                  </div>

                    {/* Remove Button */}
                    <button
                      onClick={() => removeFromSelected(item.id)}
                      className="text-red-500 hover:text-red-600 p-1"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Qty and Notes */}
                  <div className="mt-3 grid grid-cols-[80px_1fr] gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Qty</label>
                  <input
                        type="text"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) => updateSelected(item.id, "quantity", e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Notes</label>
                      <textarea
                        placeholder="Additional notes..."
                    value={item.notes}
                    onChange={(e) => updateSelected(item.id, "notes", e.target.value)}
                        rows={2}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
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
              className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
            />
            <span className="text-sm text-slate-600">Download as Word (.docx)</span>
          </label>
          <button
            onClick={generateDocument}
            disabled={generating}
            className="px-6 py-3 rounded-md bg-amber-500 hover:bg-amber-600 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? "⏳ Generating..." : `📥 Generate ${downloadAsWord ? "Word" : "PDF"}`}
          </button>
        </div>
      </div>
    </main>
  );
}
