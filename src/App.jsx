import React, { useState } from "react";
import Sidebar from "./components/Sidebar";

// Import all pages
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import Staff from "./pages/Staff";
import Tasks from "./pages/Tasks";
import Harvests from "./pages/Harvests";
import Suppliers from "./pages/Suppliers";
import Sops from "./pages/Sops";
import Videos from "./pages/Videos";
import Recipes from "./pages/Recipes";
import Settings from "./pages/Settings";
import Sales from "./pages/Sales";

// Map page names to components
const pages = {
  dashboard: Dashboard,
  inventory: Inventory,
  staff: Staff,
  tasks: Tasks,
  harvests: Harvests,
  suppliers: Suppliers,
  sops: Sops,
  videos: Videos,
  recipes: Recipes,
  settings: Settings,
  sales: Sales,
};

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [lang, setLang] = useState("en");

  const Page = pages[page] || Dashboard;

  return (
    <div className="main-layout">
      <Sidebar
        currentPage={page}
        setPage={setPage}
        lang={lang}
        setLang={setLang}
      />
      <div className="content">
        <Page lang={lang} />
      </div>
    </div>
  );
}