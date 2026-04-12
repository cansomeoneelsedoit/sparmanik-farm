import React from 'react';
import settings from '../data/settings';
import categories from '../data/categories';
import produce from '../data/produce';
import greenhouses from '../data/greenhouses';

export default function Settings({ lang = 'en' }) {
  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>

      <div className="stat-grid">
        <div className="stat-card">
          <strong>Farm Name</strong>
          <p>{settings.farmName}</p>
        </div>
        <div className="stat-card">
          <strong>Language</strong>
          <p>{settings.language}</p>
        </div>
        <div className="stat-card">
          <strong>Exchange Rate</strong>
          <p>1 USD = Rp {settings.exchangeRate?.toLocaleString()}</p>
        </div>
      </div>

      <div style={{ marginTop: '32px' }}>
        <h2>Categories ({categories.length})</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat, idx) => (
                <tr key={idx}>
                  <td>{cat.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: '32px' }}>
        <h2>Produce ({produce.length})</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              {produce.map((prod, idx) => (
                <tr key={idx}>
                  <td>{prod.name}</td>
                  <td>{prod.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: '32px' }}>
        <h2>Greenhouses ({greenhouses.length})</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Size (m²)</th>
              </tr>
            </thead>
            <tbody>
              {greenhouses.map((gh, idx) => (
                <tr key={idx}>
                  <td>{gh.name}</td>
                  <td>{gh.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
