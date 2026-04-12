import React from 'react';
import harvests from '../data/harvests';
import greenhouses from '../data/greenhouses';

export default function Harvests({ lang = 'en' }) {
  const title = lang === 'id' ? 'Panen' : 'Harvests';

  function fmtIDR(n) {
    return 'Rp ' + Math.round(n).toLocaleString('id-ID');
  }

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US');
  };

  const getGreenhouseName = (ghId) => {
    const gh = greenhouses.find((g) => g.id === ghId);
    return gh ? gh.name : 'Unknown';
  };

  // Calculate P&L summary
  const calculateSummary = () => {
    let totalRevenue = 0;
    let totalCosts = 0;

    harvests.forEach((harvest) => {
      // Add revenue from sales
      if (harvest.sales && Array.isArray(harvest.sales)) {
        totalRevenue += harvest.sales.reduce((sum, sale) => sum + (sale.amount || 0), 0);
      }

      // Add costs from assets
      if (harvest.assets && Array.isArray(harvest.assets)) {
        totalCosts += harvest.assets.reduce((sum, asset) => sum + (asset.fifo_cost || 0), 0);
      }

      // Add costs from usage
      if (harvest.usage && Array.isArray(harvest.usage)) {
        totalCosts += harvest.usage.reduce((sum, use) => sum + (use.fifo_cost || 0), 0);
      }
    });

    return {
      revenue: totalRevenue,
      costs: totalCosts,
      profit: totalRevenue - totalCosts
    };
  };

  const summary = calculateSummary();
  const isProfit = summary.profit >= 0;

  return (
    <div className="harvests-page">
      <h1 className="page-title">{title}</h1>

      {/* P&L Summary */}
      <div className="stat-grid">
        <div className="stat-card">
          <h4>{lang === 'id' ? 'Total Pendapatan' : 'Total Revenue'}</h4>
          <p className="stat-value">{fmtIDR(summary.revenue)}</p>
        </div>
        <div className="stat-card">
          <h4>{lang === 'id' ? 'Total Biaya' : 'Total Costs'}</h4>
          <p className="stat-value">{fmtIDR(summary.costs)}</p>
        </div>
        <div className={`stat-card ${isProfit ? 'profit' : 'loss'}`}>
          <h4>{lang === 'id' ? 'Keuntungan/Kerugian' : 'Profit/Loss'}</h4>
          <p className="stat-value">{fmtIDR(summary.profit)}</p>
        </div>
      </div>

      {/* Harvest Cards */}
      <div className="harvests-grid">
        {harvests.map((harvest) => (
          <div key={harvest.id} className="card harvest-card">
            <div className="harvest-header">
              <h3>{harvest.name}</h3>
              {harvest.status === 'live' && <span className="badge-green">Live</span>}
            </div>

            <p className="harvest-variety">{lang === 'id' ? 'Varietas: ' : 'Variety: '}{harvest.variety}</p>
            <p className="harvest-greenhouse">{lang === 'id' ? 'Rumah Kaca: ' : 'Greenhouse: '}{getGreenhouseName(harvest.greenhouse_id)}</p>
            <p className="harvest-start-date">{lang === 'id' ? 'Mulai: ' : 'Started: '}{formatDate(harvest.start_date)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
