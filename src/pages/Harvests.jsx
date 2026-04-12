import React from 'react';
import harvests from '../data/harvests';
import greenhouses from '../data/greenhouses';

export default function Harvests({ lang = 'en' }) {
  const title = lang === 'id' ? 'Panen' : 'Harvests';

  function fmtIDR(n) {
    return 'Rp ' + Math.round(n).toLocaleString('id-ID');
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getGreenhouseName(ghId) {
    const gh = greenhouses.find(g => g.id === ghId);
    return gh ? gh.name : 'Unknown';
  }

  let totalRevenue = 0;
  let totalCosts = 0;
  harvests.forEach(h => {
    if (h.summary) {
      totalRevenue += h.summary.revenue;
      totalCosts += h.summary.costs;
    }
  });
  const totalProfit = totalRevenue - totalCosts;

  return (
    <div>
      <h1 className="page-title">{title}</h1>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card">
          <div className="label">{lang === 'id' ? 'Total Pendapatan' : 'Total Revenue'}</div>
          <div className="value">{fmtIDR(totalRevenue)}</div>
        </div>
        <div className="stat-card">
          <div className="label">{lang === 'id' ? 'Total Biaya' : 'Total Costs'}</div>
          <div className="value">{fmtIDR(totalCosts)}</div>
        </div>
        <div className="stat-card">
          <div className="label" style={{ color: 'var(--green)' }}>{lang === 'id' ? 'Keuntungan' : 'Profit'}</div>
          <div className="value" style={{ color: 'var(--green)' }}>{fmtIDR(totalProfit)}</div>
        </div>
      </div>

      <div className="harvest-grid">
        {harvests.map(harvest => (
          <div key={harvest.id} className="card">
            <h3 style={{ marginBottom: 12 }}>
              {harvest.name} <span className="badge-green">Live</span>
            </h3>
            <p className="harvest-info">{lang === 'id' ? 'Varietas' : 'Variety'}: {harvest.variety}</p>
            <p className="harvest-info">{lang === 'id' ? 'Rumah Kaca' : 'Greenhouse'}: {getGreenhouseName(harvest.ghId)}</p>
            <p className="harvest-info">{lang === 'id' ? 'Mulai' : 'Started'}: {formatDate(harvest.startDate)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
