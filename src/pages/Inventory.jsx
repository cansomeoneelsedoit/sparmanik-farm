import React, { useState } from "react";
import items from "../data/items";
import categories from "../data/categories";

function totalStock(item) {
  return item.batches.reduce((s, b) => s + b.remaining, 0);
}

function totalValue(item) {
  return item.batches.reduce((s, b) => s + b.remaining * b.price, 0);
}

function getCategoryBadgeClass(category) {
  switch (category) {
    case "Nutrients": return "badge-green";
    case "Irrigation": return "badge-blue";
    case "Pesticides": return "badge-red";
    case "Seeds": return "badge-green";
    case "Instruments": return "badge-purple";
    case "Pots": return "badge-green";
    case "Tools": return "badge-yellow";
    case "Packaging": return "badge-blue";
    default: return "badge-yellow";
  }
}

export default function Inventory({ lang }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "All" || item.cat === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const totalItems = filteredItems.length;
  const totalStockValue = filteredItems.reduce((sum, item) => sum + totalValue(item), 0);
  const categoriesCount = new Set(filteredItems.map((item) => item.cat)).size;

  return (
    <div>
      <h1 className="page-title">{lang === "id" ? "Inventaris" : "Inventory"}</h1>

      <div className="filter-bar">
        <input
          type="text"
          placeholder={lang === "id" ? "Cari berdasarkan nama..." : "Search by name..."}
          className="search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="filter-bar">
        <button
          className={`filter-btn ${categoryFilter === "All" ? "active" : ""}`}
          onClick={() => setCategoryFilter("All")}
        >All</button>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`filter-btn ${categoryFilter === cat ? "active" : ""}`}
            onClick={() => setCategoryFilter(cat)}
          >{cat}</button>
        ))}
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card">
          <div className="label">{lang === "id" ? "Total Item" : "Total Items"}</div>
          <div className="value">{totalItems}</div>
        </div>
        <div className="stat-card">
          <div className="label">{lang === "id" ? "Total Nilai Stok" : "Total Stock Value"}</div>
          <div className="value">A$ {Math.round(totalStockValue / 10200).toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label">{lang === "id" ? "Kategori" : "Categories"}</div>
          <div className="value">{categoriesCount}</div>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>{lang === "id" ? "Nama" : "Name"}</th>
              <th>{lang === "id" ? "Kategori" : "Category"}</th>
              <th>{lang === "id" ? "Stok" : "Stock"}</th>
              <th>Unit</th>
              <th>{lang === "id" ? "Pemasok" : "Supplier"}</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item, index) => (
              <tr key={item.id}>
                <td>{index + 1}</td>
                <td>{item.name}</td>
                <td><span className={getCategoryBadgeClass(item.cat)}>{item.cat}</span></td>
                <td>{totalStock(item)}</td>
                <td>{item.unit}</td>
                <td>{item.defaultSupplier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
