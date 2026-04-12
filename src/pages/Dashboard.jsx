import React from 'react';
import { items, harvests, tasks } from '../data';

function totalStock(item) {
  return item.batches.reduce((s, b) => s + b.remaining, 0);
}

function totalValue(item) {
  return item.batches.reduce((s, b) => s + b.remaining * b.price, 0);
}

const translations = {
  en: {
    dashboard: "Dashboard",
    totalItems: "Total Items",
    totalStockValue: "Total Stock Value",
    activeHarvests: "Active Harvests",
    pendingTasks: "Pending Tasks",
    alerts: "\u26A0\uFE0F Low Stock Alerts",
    item: "Item",
    currentStock: "Current Stock",
    reorderLevel: "Reorder Level",
    recentTasks: "Recent Tasks",
    title: "Title",
    assignee: "Assignee",
    dueDate: "Due Date",
    priority: "Priority",
    status: "Status"
  },
  id: {
    dashboard: "Dasbor",
    totalItems: "Total Barang",
    totalStockValue: "Nilai Total Stok",
    activeHarvests: "Panen Aktif",
    pendingTasks: "Tugas Menunggu",
    alerts: "\u26A0\uFE0F Peringatan Stok Rendah",
    item: "Barang",
    currentStock: "Stok Saat Ini",
    reorderLevel: "Level Pesan Ulang",
    recentTasks: "Tugas Terbaru",
    title: "Judul",
    assignee: "Ditugaskan ke",
    dueDate: "Tanggal Jatuh Tempo",
    priority: "Prioritas",
    status: "Status"
  }
};

function Dashboard({ lang = 'en' }) {
  const t = translations[lang] || translations.en;

  const totalItemsCount = items.length;
  const totalStockValueIDR = items.reduce((sum, item) => sum + totalValue(item), 0);
  const activeHarvestsCount = harvests.filter(h => h.status === "live").length;
  const pendingTasksCount = tasks.filter(t => t.status !== "completed").length;

  const lowStockAlerts = items.filter(item => {
    const stock = totalStock(item);
    return stock < item.reorder;
  }).slice(0, 5);

  const recentTasks = tasks.slice(0, 4);

  function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div>
      <h1 className="page-title">{t.dashboard}</h1>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">{t.totalItems}</div>
          <div className="value">{totalItemsCount}</div>
        </div>
        <div className="stat-card">
          <div className="label">{t.totalStockValue}</div>
          <div className="value">A$ {Math.round(totalStockValueIDR / 10200).toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label">{t.activeHarvests}</div>
          <div className="value">{activeHarvestsCount}</div>
        </div>
        <div className="stat-card">
          <div className="label">{t.pendingTasks}</div>
          <div className="value">{pendingTasksCount}</div>
        </div>
      </div>

      <div className="card">
        <h2>{t.alerts}</h2>
        <table>
          <thead>
            <tr>
              <th>{t.item}</th>
              <th>{t.currentStock}</th>
              <th>{t.reorderLevel}</th>
            </tr>
          </thead>
          <tbody>
            {lowStockAlerts.map(item => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{totalStock(item)}</td>
                <td><span className="badge-red">{item.reorder}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>{t.recentTasks}</h2>
        <table>
          <thead>
            <tr>
              <th>{t.title}</th>
              <th>{t.assignee}</th>
              <th>{t.dueDate}</th>
              <th>{t.priority}</th>
              <th>{t.status}</th>
            </tr>
          </thead>
          <tbody>
            {recentTasks.map(task => (
              <tr key={task.id}>
                <td>{task.title}</td>
                <td>{task.assignee}</td>
                <td>{formatDate(task.dueDate)}</td>
                <td>
                  <span className={task.priority === 'high' ? 'badge-red' : task.priority === 'medium' ? 'badge-yellow' : 'badge-blue'}>
                    {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                  </span>
                </td>
                <td>
                  <span className={task.status === 'completed' ? 'badge-green' : task.status === 'in_progress' ? 'badge-blue' : 'badge-yellow'}>
                    {task.status === 'completed' ? 'Completed' : task.status === 'in_progress' ? 'In Progress' : 'Pending'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Dashboard;
