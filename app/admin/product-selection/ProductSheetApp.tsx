"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import { SearchableDropdownCreatable } from "@/components/ui/searchable-dropdown-creatable";

type ApiProduct = {
  id: string;
  code: string;
  description: string;
  productDetails: string | null;
  imageUrl: string;
  type: { id: string; name: string };
  link: string | null;
  brand: string | null;
  keywords: string | null;
};

type Area = {
  id: string;
  name: string;
};

type Supplier = {
  id: string;
  name: string;
};

type SelectedProduct = {
  id: string;
  code: string;
  typeName: string;
  description: string;
  productDetails: string | null;
  imageUrl: string;
  quantity: string;
  notes: string;
  link: string | null;
  areaId: string;
  areaName: string;
};

type Message = { type: "success" | "error" | "info"; text: string };

const API_BASE = "/api/admin/product-selection";

export default function ProductSheetApp() {
  const searchParams = useSearchParams();
  const continueId = searchParams.get("continue");

  const [message, setMessage] = useState<Message | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingSelection, setLoadingSelection] = useState(false);
  const [parsingPdf, setParsingPdf] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Selection ID (for continuing/updating saved selections)
  const [selectionId, setSelectionId] = useState<string | null>(null);

  const [address, setAddress] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
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
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("all");
  const [selectedBrandFilter, setSelectedBrandFilter] = useState<string>("all");

  // Auto-save debounce ref
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load all products and areas on mount
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

    // Load areas for selection
    const loadAreas = async () => {
      try {
        const resp = await fetch("/api/admin/areas");
        if (resp.ok) {
          const data = await resp.json();
          setAreas(data.areas || []);
        }
      } catch {
        // Silently fail - areas are not critical
      }
    };
    loadAreas();

    // Load suppliers for import
    const loadSuppliers = async () => {
      try {
        const resp = await fetch("/api/admin/suppliers");
        if (resp.ok) {
          const data = await resp.json();
          setSuppliers(data.suppliers || []);
        }
      } catch {
        // Silently fail
      }
    };
    loadSuppliers();
  }, []);

  // Load saved selection if continuing
  useEffect(() => {
    if (!continueId) return;

    const loadSavedSelection = async () => {
      setLoadingSelection(true);
      try {
        const resp = await fetch(`/api/admin/saved-selections/${continueId}`);
        if (!resp.ok) {
          const errBody = await resp.json().catch(() => ({}));
          throw new Error(errBody?.error || "Failed to load saved selection");
        }
        const data = await resp.json();
        const selection = data.selection;

        if (selection) {
          // Don't set selectionId - we want to save as NEW when editing a loaded selection
          // setSelectionId(selection.id);
          setAddress(selection.address || "");
          setDate(selection.date || new Date().toISOString().split("T")[0]);
          setContactName(selection.contactName || "");
          setCompany(selection.company || "");
          setPhoneNumber(selection.phoneNumber || "");
          setEmail(selection.email || "");
          
          // Load products - they are stored with all their info
          if (Array.isArray(selection.products)) {
            setSelected(selection.products);
          }

          setMessage({ type: "info", text: "Selection loaded - changes will save as a new selection" });
        }
      } catch (err) {
        setMessage({
          type: "error",
          text: err instanceof Error ? err.message : "Failed to load selection",
        });
      } finally {
        setLoadingSelection(false);
      }
    };

    loadSavedSelection();
  }, [continueId]);

  // Save selection function
  const saveSelection = useCallback(async (showMessage = true) => {
    if (!address.trim()) return; // Don't save without address

    setSaving(true);
    try {
      const resp = await fetch("/api/admin/saved-selections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectionId,
          address: address.trim(),
          date,
          contactName: contactName.trim(),
          company: company.trim(),
          phoneNumber: phoneNumber.trim(),
          email: email.trim(),
          products: selected,
          status: "draft",
        }),
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody?.error || "Failed to save selection");
      }

      const data = await resp.json();
      if (data.selection?.id && !selectionId) {
        setSelectionId(data.selection.id);
      }
      setLastSaved(new Date());
      if (showMessage) {
        setMessage({ type: "success", text: "Selection saved" });
      }
    } catch (err) {
      console.error("Save error:", err);
      if (showMessage) {
        setMessage({
          type: "error",
          text: err instanceof Error ? err.message : "Failed to save",
        });
      }
    } finally {
      setSaving(false);
    }
  }, [address, date, contactName, company, phoneNumber, email, selected, selectionId]);

  // Auto-save when data changes (debounced)
  useEffect(() => {
    if (!address.trim()) return; // Don't auto-save without address

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      saveSelection(false);
    }, 3000); // Auto-save after 3 seconds of no changes

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [address, date, contactName, company, phoneNumber, email, selected, saveSelection]);

  // Get unique type names for filter
  const typeNames = useMemo(() => {
    const types = new Set<string>();
    allProducts.forEach((p) => types.add(p.type?.name || "Other"));
    return Array.from(types).sort();
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

    // Apply type filter
    if (selectedTypeFilter !== "all") {
      products = products.filter((p) => (p.type?.name || "Other") === selectedTypeFilter);
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
        const typeMatch = p.type?.name.toLowerCase().includes(q) || false;
        return codeMatch || descMatch || brandMatch || keywordsMatch || detailsMatch || typeMatch;
      });
    }

    return products;
  }, [allProducts, searchQuery, selectedTypeFilter, selectedBrandFilter]);

  // Group filtered products by type
  const productsByType = useMemo(() => {
    return filteredProducts.reduce<Record<string, ApiProduct[]>>((acc, p) => {
      const key = p.type?.name || "Other";
      acc[key] = acc[key] ? [...acc[key], p] : [p];
      return acc;
    }, {});
  }, [filteredProducts]);

  const filteredTypeNames = useMemo(() => Object.keys(productsByType).sort(), [productsByType]);

  const toggleType = (typeName: string) => {
    setExpandedAreas((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(typeName)) {
        newSet.delete(typeName);
      } else {
        newSet.add(typeName);
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
          typeName: p.type?.name || "Other",
          quantity: "",
          notes: "",
          link: p.link,
          areaId: "",
          areaName: "",
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

  const updateSelectedArea = (id: string, areaName: string, areaId?: string) => {
    setSelected((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, areaId: areaId || "", areaName } : s
      )
    );
  };

  // PDF Upload Handler
  const handlePdfUpload = useCallback(
    async (file: File) => {
      if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
        setMessage({ type: "error", text: "Please upload a PDF file" });
        return;
      }

      if (!selectedSupplierId) {
        setMessage({ type: "error", text: "Please select a supplier first" });
        return;
      }

      setParsingPdf(true);
      setMessage(null);
      setPdfParseInfo(null);

      try {
        const formData = new FormData();
        formData.append("pdf", file);
        formData.append("supplierId", selectedSupplierId);

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
    [addProductToSelected, selectedSupplierId]
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
    setSelectedTypeFilter("all");
    setSelectedBrandFilter("all");
  };

  const validate = () => {
    if (!address.trim()) return "Address is required";
    if (selected.length === 0) return "Select at least one product";
    const missingArea = selected.find((p) => !p.areaName);
    if (missingArea) return `Please select an area for product: ${missingArea.code}`;
    return null;
  };

  const buildPayloadProducts = () =>
    selected.map((p) => ({
      category: p.areaName, // Group by area, not type
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

      // Auto-save selection after successful generation
      await saveSelection(false);
      
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

  const hasActiveFilters = searchQuery.trim() || selectedTypeFilter !== "all" || selectedBrandFilter !== "all";

  return (
    <main className="min-h-screen bg-slate-50 py-16 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Admin</p>
            <h1 className="text-2xl font-semibold text-slate-900">
              Product Selection
              {selectionId && <span className="text-sm font-normal text-slate-400 ml-2">(Editing saved)</span>}
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-sm text-slate-500">
                Select products to generate a selection document
              </p>
              {lastSaved && (
                <span className="text-xs text-green-600">
                  • Saved {lastSaved.toLocaleTimeString()}
                </span>
              )}
              {saving && (
                <span className="text-xs text-amber-600">• Saving...</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => saveSelection(true)}
              disabled={saving || !address.trim()}
              className="px-4 py-2 text-sm bg-green-500 text-white rounded hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "💾 Save"}
            </button>
            <a
              href="/admin/saved-selections"
              className="px-4 py-2 text-sm border border-slate-300 rounded hover:bg-white transition-colors"
            >
              View Saved
            </a>
            <a
              href="/admin"
              className="px-4 py-2 text-sm border border-slate-300 rounded hover:bg-white transition-colors"
            >
              Back to Admin
            </a>
          </div>
        </div>

        {/* Loading Selection Overlay */}
        {loadingSelection && (
          <div className="bg-blue-100 border border-blue-300 text-blue-800 rounded-lg px-4 py-3 text-sm">
            Loading saved selection...
          </div>
        )}

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
          <h2 className="text-lg font-semibold text-slate-900 mb-2">📄 Import from Supplier Sheet</h2>
          <p className="text-sm text-slate-600 mb-4">
            Select a supplier and upload their quote/order PDF to automatically select matching products.
          </p>
          
          {/* Supplier Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Supplier *</label>
            <div className="flex gap-2 items-center">
              {suppliers.length === 0 ? (
                <div className="flex-1 flex items-center gap-2">
                  <div className="h-10 flex-1 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 animate-pulse rounded-md" />
                  <a href="/admin/suppliers" className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                    + Add suppliers
                  </a>
                </div>
              ) : (
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">Select a supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Upload Area - Only show when supplier is selected */}
          {selectedSupplierId ? (
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
                  {parsingPdf ? "Extracting products..." : isDragging ? "Drop PDF here" : "Upload PDF"}
                </p>
                <p className="text-xs text-slate-500 text-center">
                  {parsingPdf ? "Matching product codes with database..." : "Drag and drop, or click to browse"}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 py-8 px-6 text-center">
              <p className="text-sm text-slate-500">Select a supplier above to upload their sheet</p>
            </div>
          )}

          {pdfParseInfo && pdfParseInfo.notFound.length > 0 && (
            <div className="mt-4 space-y-3">
              {pdfParseInfo.notFound.map((code) => {
                const suggestions = pdfParseInfo.suggestedMatches[code] || [];
                // Filter out suggestions that are already selected
                const availableSuggestions = suggestions.filter(
                  (s) => !selected.some((sel) => sel.id === s.id)
                );
                return (
                  <div key={code} className="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
                    <p className="text-sm font-medium text-amber-700 mb-2">
                      Code not found: <span className="font-bold">{code}</span>
                    </p>
                    {suggestions.length > 0 ? (
                      <div className="space-y-2">
                        {availableSuggestions.length > 0 ? (
                          <>
                            <p className="text-xs text-amber-600">Did you mean:</p>
                            <div className="flex flex-wrap gap-2">
                              {availableSuggestions.map((suggestion) => (
                                <button
                                  key={suggestion.id}
                                  onClick={() => {
                                    const product = allProducts.find((p) => p.id === suggestion.id);
                                    if (product) {
                                      addProductToSelected(product);
                                      // Remove this code from notFound list
                                      setPdfParseInfo((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              notFound: prev.notFound.filter((c) => c !== code),
                                            }
                                          : null
                                      );
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-amber-300 rounded text-xs hover:bg-amber-100 transition-colors"
                                >
                                  <span className="font-medium text-amber-800">{suggestion.code}</span>
                                  <span className="text-amber-600">({suggestion.matchType})</span>
                                  <span className="text-green-600 font-bold">+</span>
                                </button>
                              ))}
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-green-600">✓ A suggested product was added</p>
                        )}
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
              <select
                value={selectedTypeFilter}
                onChange={(e) => setSelectedTypeFilter(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              >
                <option value="all">All Types</option>
                {typeNames.map((typeName) => (
                  <option key={typeName} value={typeName}>
                    {typeName}
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
          ) : filteredTypeNames.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              {hasActiveFilters ? "No products match your filters" : "No products found"}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTypeNames.map((typeName) => {
                const isExpanded = expandedAreas.has(typeName);
                const typeProducts = productsByType[typeName] || [];
                const selectedInTypeCount = typeProducts.filter((p) =>
                  selected.some((s) => s.id === p.id)
                ).length;

                return (
                  <div key={typeName} className="border border-slate-200 rounded-lg overflow-hidden">
                    {/* Type Header */}
                    <button
                      onClick={() => toggleType(typeName)}
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
                        <span className="text-slate-900 font-medium">{typeName}</span>
                        <span className="text-sm text-slate-500">({typeProducts.length} products)</span>
                      </div>
                      {selectedInTypeCount > 0 && (
                        <span className="bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded">
                          {selectedInTypeCount} selected
                        </span>
                      )}
                    </button>

                    {/* Area Products */}
                    {isExpanded && (
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-white">
                        {typeProducts.map((product) => {
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
                              <div className="aspect-video bg-slate-100 relative overflow-hidden flex items-center justify-center p-2">
                                <img
                                  src={product.imageUrl || "/no-image.png"}
                                  alt={product.description}
                                  className="max-h-full w-auto object-scale-down"
                                  style={{ maxWidth: '100%', height: 'auto', maxHeight: '100%' }}
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

        {/* Selected Products - Organized by Area with Drag & Drop */}
        {selected.length > 0 && (
          <SelectedProductsOrganizer
            selected={selected}
            setSelected={setSelected}
            areas={areas}
            updateSelectedArea={updateSelectedArea}
            updateSelected={updateSelected}
            removeFromSelected={removeFromSelected}
          />
        )}

        {/* Bottom Message */}
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

// Drag & Drop Area Organizer Component
function SelectedProductsOrganizer({
  selected,
  setSelected,
  areas,
  updateSelectedArea,
  updateSelected,
  removeFromSelected,
}: {
  selected: SelectedProduct[];
  setSelected: React.Dispatch<React.SetStateAction<SelectedProduct[]>>;
  areas: Area[];
  updateSelectedArea: (id: string, areaName: string, areaId?: string) => void;
  updateSelected: (id: string, field: "quantity" | "notes", value: string) => void;
  removeFromSelected: (id: string) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverArea, setDragOverArea] = useState<string | null>(null);

  // Get unique area names from selected products
  const usedAreaNames = useMemo(() => {
    const areaSet = new Set<string>();
    selected.forEach((p) => {
      if (p.areaName) areaSet.add(p.areaName);
    });
    return Array.from(areaSet).sort();
  }, [selected]);

  // Products without an area
  const unassignedProducts = useMemo(
    () => selected.filter((p) => !p.areaName),
    [selected]
  );

  // Products grouped by area
  const productsByArea = useMemo(() => {
    const grouped: Record<string, SelectedProduct[]> = {};
    usedAreaNames.forEach((area) => {
      grouped[area] = selected.filter((p) => p.areaName === area);
    });
    return grouped;
  }, [selected, usedAreaNames]);

  const hasAnyAreas = usedAreaNames.length > 0;

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, productId: string) => {
    // Set data immediately before any state changes
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", productId);
    
    // Create a custom drag image
    const dragEl = e.currentTarget as HTMLElement;
    const rect = dragEl.getBoundingClientRect();
    e.dataTransfer.setDragImage(dragEl, rect.width / 2, 20);
    
    // Delay state update to prevent re-render interrupting drag
    setTimeout(() => setDraggedId(productId), 0);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverArea(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, areaName: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverArea(areaName);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverArea(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, areaName: string) => {
    e.preventDefault();
    const productId = e.dataTransfer.getData("text/plain");
    if (productId) {
      // Find area id if it's a saved area
      const area = areas.find((a) => a.name === areaName);
      updateSelectedArea(productId, areaName, area?.id);
    }
    setDragOverArea(null);
    setDraggedId(null);
  }, [areas, updateSelectedArea]);

  // Render a single product card (compact, draggable)
  const ProductCard = ({ item, showAreaDropdown = false }: { item: SelectedProduct; showAreaDropdown?: boolean }) => (
    <div
      draggable
      onDragStart={(e) => handleDragStart(e, item.id)}
      onDragEnd={handleDragEnd}
      className={`bg-white rounded-lg p-3 border shadow-sm cursor-grab active:cursor-grabbing transition-all ${
        draggedId === item.id ? "opacity-50 scale-95" : "border-slate-200 hover:border-amber-300"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Drag Handle */}
        <div className="flex-shrink-0 text-slate-300 mt-1">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
          </svg>
        </div>

        {/* Thumbnail */}
        <div className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-slate-100 flex items-center justify-center">
          <img
            src={item.imageUrl || "/no-image.png"}
            alt={item.description}
            className="max-w-full max-h-full object-scale-down"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/no-image.png";
            }}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="bg-slate-200 text-slate-800 text-xs font-bold px-1.5 py-0.5 rounded">
              {item.code}
            </span>
            <span className="text-xs text-slate-400">{item.typeName}</span>
          </div>
          <p className="text-xs text-slate-600 truncate mt-0.5">{item.description}</p>
        </div>

        {/* Remove */}
        <button
          onClick={() => removeFromSelected(item.id)}
          className="text-slate-400 hover:text-red-500 p-0.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Qty & Notes Row */}
      <div className="mt-2 flex gap-2">
        {showAreaDropdown && (
          <div className="flex-1">
            <SearchableDropdownCreatable
              options={areas}
              value={item.areaName}
              onChange={(name, id) => updateSelectedArea(item.id, name, id)}
              placeholder="Area..."
              error={!item.areaName}
            />
          </div>
        )}
        <input
          type="text"
          placeholder="Qty"
          value={item.quantity}
          onChange={(e) => updateSelected(item.id, "quantity", e.target.value)}
          className="w-16 rounded border border-slate-300 px-2 py-1 text-xs focus:ring-1 focus:ring-amber-500"
        />
        <input
          type="text"
          placeholder="Notes"
          value={item.notes}
          onChange={(e) => updateSelected(item.id, "notes", e.target.value)}
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs focus:ring-1 focus:ring-amber-500"
        />
      </div>
    </div>
  );

  // Area drop zone
  const AreaDropZone = ({ areaName, products }: { areaName: string; products: SelectedProduct[] }) => (
    <div
      onDragOver={(e) => handleDragOver(e, areaName)}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, areaName)}
      className={`rounded-lg border-2 transition-all ${
        dragOverArea === areaName
          ? "border-amber-400 bg-amber-50"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      {/* Area Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white rounded-t-lg">
        <div className="flex items-center gap-2">
          <span className="text-lg">📍</span>
          <h3 className="font-semibold text-slate-900">{areaName}</h3>
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
            {products.length} item{products.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Products */}
      <div className="p-3 space-y-2 min-h-[80px]">
        {products.length === 0 ? (
          <div className="text-center py-4 text-sm text-slate-400">
            Drop products here
          </div>
        ) : (
          products.map((item) => (
            <ProductCard key={item.id} item={item} />
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">✅ Selected Products ({selected.length})</h2>
          {hasAnyAreas && (
            <p className="text-xs text-slate-500 mt-1">
              Drag products between areas or drop into area boxes
            </p>
          )}
        </div>
        <button
          onClick={() => setSelected([])}
          className="text-sm text-red-500 hover:underline"
        >
          Clear All
        </button>
      </div>

      {/* If no areas assigned yet, show simple list with dropdowns */}
      {!hasAnyAreas ? (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            💡 Assign an area to a product to enable drag & drop organization
          </div>
          {selected.map((item) => (
            <ProductCard key={item.id} item={item} showAreaDropdown />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Unassigned Products */}
          {unassignedProducts.length > 0 && (
            <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200">
                <span className="text-lg">📦</span>
                <h3 className="font-medium text-slate-700">Unassigned</h3>
                <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                  {unassignedProducts.length}
                </span>
              </div>
              <div className="p-3 space-y-2">
                {unassignedProducts.map((item) => (
                  <ProductCard key={item.id} item={item} showAreaDropdown />
                ))}
              </div>
            </div>
          )}

          {/* Area Groups */}
          {usedAreaNames.map((areaName) => (
            <AreaDropZone
              key={areaName}
              areaName={areaName}
              products={productsByArea[areaName] || []}
            />
          ))}

          {/* Create New Area Drop Zone */}
          <div
            onDragOver={(e) => handleDragOver(e, "__new__")}
            onDragLeave={handleDragLeave}
            onDrop={(e) => {
              e.preventDefault();
              const productId = e.dataTransfer.getData("text/plain");
              if (productId) {
                const newAreaName = prompt("Enter new area name:");
                if (newAreaName?.trim()) {
                  const area = areas.find((a) => a.name.toLowerCase() === newAreaName.trim().toLowerCase());
                  updateSelectedArea(productId, newAreaName.trim(), area?.id);
                }
              }
              setDragOverArea(null);
              setDraggedId(null);
            }}
            className={`rounded-lg border-2 border-dashed text-center py-6 transition-all ${
              dragOverArea === "__new__"
                ? "border-green-400 bg-green-50 text-green-700"
                : "border-slate-300 text-slate-400"
            }`}
          >
            <span className="text-2xl">➕</span>
            <p className="text-sm mt-1">Drop here to create a new area</p>
          </div>
        </div>
      )}
    </div>
  );
}
