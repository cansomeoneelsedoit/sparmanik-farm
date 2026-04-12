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
    <div className="page">
      <h1 className="page-title">Suppliers</h1>

      <div className="filter-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Search by supplier name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <span className="stat-card">
          {filteredSuppliers.length} suppliers
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Notes</th>
              <th>Shop URL</th>
            </tr>
          </thead>
          <tbody>
            {filteredSuppliers.map((supplier, idx) => (
              <tr key={idx}>
                <td>{supplier.name}</td>
                <td>{supplier.notes || '—'}</td>
                <td>
                  {supplier.shopUrl ? (
                    <a
                      href={supplier.shopUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link"
                    >
                      Visit
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
