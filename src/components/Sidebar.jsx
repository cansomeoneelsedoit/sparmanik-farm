import React from "react";

export default function Sidebar({ currentPage, setPage, lang, setLang }) {
  const navItems = [
    { id: "dashboard", label_en: "Dashboard", label_id: "Dasbor", icon: "\u{1F4CA}" },
    { id: "inventory", label_en: "Inventory", label_id: "Inventaris", icon: "\u{1F4E6}" },
    { id: "staff", label_en: "Staff", label_id: "Staf", icon: "\u{1F465}" },
    { id: "tasks", label_en: "Tasks", label_id: "Tugas", icon: "\u2705" },
    { id: "harvests", label_en: "Harvests", label_id: "Panen", icon: "\u{1F33E}" },
    { id: "suppliers", label_en: "Suppliers", label_id: "Pemasok", icon: "\u{1F3EA}" },
    { id: "sops", label_en: "SOPs", label_id: "SOP", icon: "\u{1F4CB}" },
    { id: "videos", label_en: "Videos", label_id: "Video", icon: "\u{1F3A5}" },
    { id: "sales", label_en: "Sales", label_id: "Penjualan", icon: "\u{1F4B0}" },
    { id: "settings", label_en: "Settings", label_id: "Pengaturan", icon: "\u2699\uFE0F" },
  ];

  const getLabel = (item) => {
    return lang === "en" ? item.label_en : item.label_id;
  };

  const toggleLang = () => {
    setLang(lang === "en" ? "id" : "en");
  };

  return (
    <div className="sidebar">
      <div className="logo">
        <div className="logo-icon">S</div>
        <div className="logo-text">
          <strong>Sparmanik Farm</strong>
          Cultivation OS
        </div>
      </div>

      <nav className="nav-menu">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${currentPage === item.id ? "active" : ""}`}
            onClick={() => setPage(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            {getLabel(item)}
          </button>
        ))}
      </nav>

      <div className="language-toggle">
        <button className="lang-btn" onClick={toggleLang}>
          {lang === "en" ? "\u{1F310} EN / ID" : "\u{1F310} ID / EN"}
        </button>
      </div>
    </div>
  );
}
