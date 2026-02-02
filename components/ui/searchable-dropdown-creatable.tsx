"use client";

import { useState, useRef, useEffect } from "react";

type Option = {
  id: string;
  name: string;
};

type SearchableDropdownCreatableProps = {
  options: Option[];
  value: string; // This is the name/label, not ID
  onChange: (value: string, id?: string) => void; // Returns name and optionally ID if selected from list
  placeholder?: string;
  className?: string;
  required?: boolean;
  error?: boolean;
};

export function SearchableDropdownCreatable({
  options,
  value,
  onChange,
  placeholder = "Select or type...",
  className = "",
  required = false,
  error = false,
}: SearchableDropdownCreatableProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = options.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase())
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // If there's a search value but nothing selected, use the search value as custom
        if (search && !value) {
          onChange(search);
        }
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [search, value, onChange]);

  const handleSelect = (option: Option) => {
    onChange(option.name, option.id);
    setIsOpen(false);
    setSearch("");
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearch(newValue);
    // Don't call onChange while typing - only on blur/enter/select
  };

  const handleOpen = () => {
    setIsOpen(true);
    setSearch(value); // Start with current value in search
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredOptions.length > 0) {
        handleSelect(filteredOptions[0]);
      } else if (search) {
        onChange(search);
        setIsOpen(false);
        setSearch("");
      }
    }
    if (e.key === "Escape") {
      setIsOpen(false);
      setSearch("");
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button / Input */}
      {isOpen ? (
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${
            error ? "border-red-300 bg-red-50" : "border-amber-400"
          }`}
        />
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className={`w-full text-left rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white flex items-center justify-between ${
            error ? "border-red-300 bg-red-50" : "border-slate-300"
          }`}
        >
          <span className={value ? "text-slate-900" : "text-slate-400"}>
            {value || placeholder}
          </span>
          <svg
            className="w-4 h-4 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-hidden">
          {/* Options List */}
          <div className="max-h-44 overflow-y-auto">
            {filteredOptions.length === 0 && search ? (
              <div className="px-3 py-2 text-sm text-slate-600">
                Press <span className="font-medium">Enter</span> to use "{search}"
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-400">No saved areas - type to create</div>
            ) : (
              <>
                {filteredOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleSelect(option)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors ${
                      option.name === value ? "bg-amber-100 text-amber-800 font-medium" : "text-slate-700"
                    }`}
                  >
                    {option.name}
                  </button>
                ))}
                {search && !filteredOptions.find((o) => o.name.toLowerCase() === search.toLowerCase()) && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange(search);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    className="w-full text-left px-3 py-2 text-sm bg-slate-50 text-slate-600 hover:bg-amber-50 border-t border-slate-100"
                  >
                    Use "{search}" (custom)
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

