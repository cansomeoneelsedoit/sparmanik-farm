import React, { useState, useMemo } from 'react';
import suppliers from '../data/suppliers';

export default function Suppliers({ lang = 'en' }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(supplier =>
      supplier.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  return (
    <div>
      <h1 className="page-title">{lang === 'id' ? 'Pemasok' : 'Suppliers'}</h1>

      <div className="filter-bar">
        <input
          type="text"
          className="search-input"
          placeholder={lang === 'id' ? 'Cari berdasarkan nama pemasok...' : 'Search by supplier name...'}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <span className="stat-card" style={{ padding: '8px 16px', fontSize: 13 }}>
          {filteredSuppliers.length} {lang === 'id' ? 'pemasok' : 'suppliers'}
        </span>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{lang === 'id' ? 'Nama' : 'Name'}</th>
              <th>{lang === 'id' ? 'Catatan' : 'Notes'}</th>
              <th>Shop URL</th>
            </tr>
          </thead>
          <tbody>
            {filteredSuppliers.map((supplier, idx) => (
              <tr key={idx}>
                <td>{supplier.name}</td>
                <td>{supplier.notes || '\u2014'}</td>
                <td>
                  {supplier.shopUrl ? (
                    <a href={supplier.shopUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                      Visit
                    </a>
                  ) : '\u2014'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
