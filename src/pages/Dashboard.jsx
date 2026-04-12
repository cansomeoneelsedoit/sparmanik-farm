import { items, harvests, tasks, staff } from '../data';

// Helper functions
function fmtAUD(n) {
  return "A$ " + n.toFixed(2);
}

function fmtIDR(n) {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

function totalStock(item) {
  return item.batches.reduce((s, b) => s + b.remaining, 0);
}

function totalValue(item) {
  return item.batches.reduce((s, b) => s + b.remaining * b.price, 0);
}

// Translations
const translations = {
  en: {
    dashboard: "Dashboard",
    totalItems: "Total Items",
    totalStockValue: "Total Stock Value",
    activeHarvests: "Active Harvests",
    pendingTasks: "Pending Tasks",
    alerts: "Low Stock Alerts",
    itemName: "Item",
    currentStock: "Current Stock",
    reorderLevel: "Reorder Level",
    noAlerts: "All stock levels are healthy",
    recentTasks: "Recent Tasks",
    title: "Title",
    assignee: "Assignee",
    dueDate: "Due Date",
    priority: "Priority",
    status: "Status",
    noTasks: "No tasks",
    staffOverview: "Staff Overview",
    role: "Role",
    rate: "Current Rate",
    noStaff: "No staff"
  },
  id: {
    dashboard: "Dasbor",
    totalItems: "Total Barang",
    totalStockValue: "Nilai Total Stok",
    activeHarvests: "Panen Aktif",
    pendingTasks: "Tugas Menunggu",
    alerts: "Peringatan Stok Rendah",
    itemName: "Barang",
    currentStock: "Stok Saat Ini",
    reorderLevel: "Level Pesan Ulang",
    noAlerts: "Semua level stok sehat",
    recentTasks: "Tugas Terbaru",
    title: "Judul",
    assignee: "Ditugaskan ke",
    dueDate: "Tanggal Jatuh Tempo",
    priority: "Prioritas",
    status: "Status",
    noTasks: "Tidak ada tugas",
    staffOverview: "Ikhtisar Staf",
    role: "Peran",
    rate: "Tarif Saat Ini",
    noStaff: "Tidak ada staf"
  }
};

function Dashboard({ lang = 'en' }) {
  const t = translations[lang] || translations.en;

  // Calculate stats
  const totalItemsCount = items.length;
  const totalStockValueAUD = items.reduce((sum, item) => sum + totalValue(item), 0);
  const activeHarvestsCount = harvests.filter(h => h.status === "live").length;
  const pendingTasksCount = tasks.filter(t => t.status !== "completed").length;

  // Low stock alerts
  const lowStockAlerts = items.filter(item => {
    const stock = totalStock(item);
    return stock < item.reorder;
  });

  // Recent tasks sorted by dueDate
  const recentTasks = tasks.slice().sort((a, b) => {
    return new Date(a.dueDate) - new Date(b.dueDate);
  });

  // Get current staff rates
  const staffWithRates = staff.map(s => ({
    ...s,
    currentRate: s.rates[s.rates.length - 1]?.rate || 0
  }));

  // Determine priority badge color
  function getPriorityColor(priority) {
    switch (priority) {
      case 'high':
        return 'badge-red';
      case 'medium':
        return 'badge-yellow';
      case 'low':
        return 'badge-blue';
      default:
        return 'badge-blue';
    }
  }

  // Determine status badge color
  function getStatusColor(status) {
    switch (status) {
      case 'completed':
        return 'badge-green';
      case 'in_progress':
        return 'badge-yellow';
      case 'pending':
        return 'badge-red';
      default:
        return 'badge-blue';
    }
  }

  // Format date
  function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  return (
    <div className="page">
      <h1 className="page-title" style={{ fontFamily: 'Instrument Serif' }}>
        {t.dashboard}
      </h1>

      {/* Stats Row */}
      <div className="stat-grid">
        <div className="stat-card card">
          <div className="label">{t.totalItems}</div>
          <div className="value">{totalItemsCount}</div>
        </div>
        <div className="stat-card card">
          <div className="label">{t.totalStockValue}</div>
          <div className="value">{fmtAUD(totalStockValueAUD)}</div>
        </div>
        <div className="stat-card card">
          <div className="label">{t.activeHarvests}</div>
          <div className="value">{activeHarvestsCount}</div>
        </div>
        <div className="stat-card card">
          <div className="label">{t.pendingTasks}</div>
          <div className="value">{pendingTasksCount}</div>
        </div>
      </div>

      {/* Alerts Section */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h2 style={{ marginTop: 0, marginBottom: '16px' }}>{t.alerts}</h2>
        {lowStockAlerts.length === 0 ? (
          <p style={{ color: 'var(--text2)' }}>{t.noAlerts}</p>
        ) : (
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>
                    {t.itemName}
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>
                    {t.currentStock}
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>
                    {t.reorderLevel}
                  </th>
                </tr>
              </thead>
              <tbody>
                {lowStockAlerts.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{ fontSize: '14px' }}>{item.name}</span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <span>{totalStock(item)}</span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <span className="badge-red" style={{ padding: '4px 8px', borderRadius: '4px', display: 'inline-block', fontSize: '12px' }}>
                        {item.reorder}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Tasks */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h2 style={{ marginTop: 0, marginBottom: '16px' }}>{t.recentTasks}</h2>
        {recentTasks.length === 0 ? (
          <p style={{ color: 'var(--text2)' }}>{t.noTasks}</p>
        ) : (
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>
                    {t.title}
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>
                    {t.assignee}
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>
                    {t.dueDate}
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>
                    {t.priority}
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>
                    {t.status}
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentTasks.map(task => (
                  <tr key={task.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{ fontSize: '14px' }}>{task.title}</span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{ fontSize: '14px' }}>{task.assignee}</span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{ fontSize: '14px' }}>{formatDate(task.dueDate)}</span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <span
                        className={getPriorityColor(task.priority)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          display: 'inline-block',
                          fontSize: '12px',
                          textTransform: 'capitalize'
                        }}
                      >
                        {task.priority}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <span
                        className={getStatusColor(task.status)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          display: 'inline-block',
                          fontSize: '12px',
                          textTransform: 'capitalize'
                        }}
                      >
                        {task.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Staff Overview */}
      <div className="card">
        <h2 style={{ marginTop: 0, marginBottom: '16px' }}>{t.staffOverview}</h2>
        {staffWithRates.length === 0 ? (
          <p style={{ color: 'var(--text2)' }}>{t.noStaff}</p>
        ) : (
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>
                    {t.itemName}
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>
                    {t.role}
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>
                    {t.rate}
                  </th>
                </tr>
              </thead>
              <tbody>
                {staffWithRates.map(member => (
                  <tr key={member.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{ fontSize: '14px' }}>{member.name}</span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{ fontSize: '14px' }}>{member.role}</span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{ fontSize: '14px' }}>{fmtIDR(member.currentRate)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
