import React, { useState } from "react";
import items from "../data/items";
import categories from "../data/categories";

// Helper functions
function totalStock(item) {
  return item.batches.reduce((s, b) => s + b.remaining, 0);
}

function totalValue(item) {
  return item.batches.reduce((s, b) => s + b.remaining * b.price, 0);
}

function avgCost(item) {
  const s = totalStock(item);
  return s > 0 ? totalValue(item) / s : 0;
}

function fmtAUD(n) {
  return "A$ " + n.toFixed(2);
}

// Category color mapping
function getCategoryBadgeClass(category) {
  switch (category) {
    case "Nutrients":
      return "badge-green";
    case "Irrigation":
      return "badge-blue";
    case "Pesticides":
      return "badge-red";
    case "Seeds":
      return "badge-purple";
    default:
      return "badge";
  }
}

// Truncate long names
function truncateName(name, maxLength = 40) {
  return name.length > maxLength ? name.substring(0, maxLength) + "..." : name;
}

export default function Inventory({ lang }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  // Filter items based on search and category
  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      categoryFilter === "All" || item.cat === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Calculate stats
  const totalItems = filteredItems.length;
  const totalStockValue = filteredItems.reduce(
    (sum, item) => sum + totalValue(item),
    0
  );
  const categoriesCount = new Set(filteredItems.map((item) => item.cat)).size;

  return (
    <div className="page-container">
      <h1 className="page-title">
        {lang === "en" ? "Inventory" : "Inventaris"}
      </h1>

      {/* Filter bar */}
      <div className="filter-bar">
        <input
          type="text"
          placeholder={lang === "en" ? "Search by name..." : "Cari berdasarkan nama..."}
          className="search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Category filter buttons */}
      <div className="filter-bar">
        <button
          className={`filter-btn ${categoryFilter === "All" ? "active" : ""}`}
          onClick={() => setCategoryFilter("All")}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`filter-btn ${
              categoryFilter === cat ? "active" : ""
            }`}
            onClick={() => setCategoryFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">
            {lang === "en" ? "Total Items" : "Total Item"}
          </div>
          <div className="value">{totalItems}</div>
        </div>
        <div className="stat-card">
          <div className="label">
            {lang === "en" ? "Total Stock Value" : "Total Nilai Stok"}
          </div>
          <div className="value">{fmtAUD(totalStockValue / 10200)}</div>
        </div>
        <div className="stat-card">
          <div className="label">
            {lang === "en" ? "Categories" : "Kategori"}
          </div>
          <div className="value">{categoriesCount}</div>
        </div>
      </div>

      {/* Items table */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{lang === "en" ? "Name" : "Nama"}</th>
                <th>{lang === "en" ? "Category" : "Kategori"}</th>
                <th>{lang === "en" ? "Stock" : "Stok"}</th>
                <th>{lang === "en" ? "Unit" : "Unit"}</th>
                <th>{lang === "en" ? "Avg Cost (AUD)" : "Biaya Rata-rata (AUD)"}</th>
                <th>{lang === "en" ? "Total Value (AUD)" : "Total Nilai (AUD)"}</th>
                <th>{lang === "en" ? "Supplier" : "Pemasok"}</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item, index) => (
                <tr key={item.id}>
                  <td>{index + 1}</td>
                  <td>{truncateName(item.name)}</td>
                  <td>
                    <span className={`badge ${getCategoryBadgeClass(item.cat)}`}>
                      {item.cat}
                    </span>
                  </td>
                  <td>{totalStock(item)}</td>
                  <td>{item.unit}</td>
                  <td>{fmtAUD(avgCost(item) / 10200)}</td>
                  <td>{fmtAUD(totalValue(item) / 10200)}</td>
                  <td>{item.defaultSupplier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
