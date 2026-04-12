import React from "react";

export default function Sidebar({ currentPage, setPage, lang, setLang }) {
  const navItems = [
    { id: "dashboard", label_en: "Dashboard", label_id: "Dashboard", icon: "📊" },
    { id: "inventory", label_en: "Inventory", label_id: "Inventaris", icon: "📦" },
    { id: "harvests", label_en: "Harvests", label_id: "Panen", icon: "🌱" },
    { id: "sales", label_en: "Sales", label_id: "Penjualan", icon: "💰" },
    { id: "staff", label_en: "Staff", label_id: "Staf", icon: "👷" },
    { id: "tasks", label_en: "Tasks", label_id: "Tugas", icon: "📋" },
    { id: "suppliers", label_en: "Suppliers", label_id: "Pemasok", icon: "🏪" },
    { id: "recipes", label_en: "Recipes", label_id: "Resep", icon: "🧪" },
    { id: "sops", label_en: "SOPs", label_id: "SOP", icon: "📖" },
    { id: "videos", label_en: "Videos", label_id: "Video", icon: "🎥" },
    { id: "settings", label_en: "Settings", label_id: "Pengaturan", icon: "⚙️" },
  ];

  const getLabel = (item) => {
    return lang === "en" ? item.label_en : item.label_id;
  };

  return (
    <div className="sidebar">
      {/* Logo Section */}
      <div className="logo">
        <div className="logo-dot">S</div>
        <div className="logo-text">
          <div className="logo-title">Sparmanik Farm</div>
          <div className="logo-subtitle">Cultivation OS</div>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="nav-menu">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${currentPage === item.id ? "active" : ""}`}
            onClick={() => setPage(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{getLabel(item)}</span>
          </button>
        ))}
      </nav>

      {/* Language Toggle */}
      <div className="language-toggle">
        <button
          className={`lang-btn ${lang === "en" ? "active" : ""}`}
          onClick={() => setLang("en")}
        >
          EN
        </button>
        <button
          className={`lang-btn ${lang === "id" ? "active" : ""}`}
          onClick={() => setLang("id")}
        >
          ID
        </button>
      </div>
    </div>
  );
}