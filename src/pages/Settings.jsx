import React from 'react';
import settings from '../data/settings';
import categories from '../data/categories';
import greenhouses from '../data/greenhouses';

export default function Settings({ lang = 'en' }) {
  return (
    <div>
      <h1 className="page-title">{lang === 'id' ? 'Pengaturan' : 'Settings'}</h1>

      <div className="card">
        <h2>{lang === 'id' ? 'Info Kebun' : 'Farm Info'}</h2>
        <table>
          <tbody>
            <tr>
              <td style={{ color: 'var(--text2)' }}>{lang === 'id' ? 'Nama Kebun' : 'Farm Name'}</td>
              <td>{settings.farmName}</td>
            </tr>
            <tr>
              <td style={{ color: 'var(--text2)' }}>{lang === 'id' ? 'Kurs' : 'Exchange Rate'}</td>
              <td>{settings.exchangeRate.toLocaleString()} IDR/AUD</td>
            </tr>
            <tr>
              <td style={{ color: 'var(--text2)' }}>{lang === 'id' ? 'Bahasa Default' : 'Default Language'}</td>
              <td>{lang === 'id' ? 'Inggris' : 'English'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>{lang === 'id' ? 'Kategori' : 'Categories'} ({categories.length})</h2>
        <p style={{ marginTop: 8, color: 'var(--text2)', fontSize: 13 }}>
          {categories.join(', ')}
        </p>
      </div>

      <div className="card">
        <h2>{lang === 'id' ? 'Rumah Kaca' : 'Greenhouses'} ({greenhouses.length})</h2>
        <table>
          <thead>
            <tr>
              <th>{lang === 'id' ? 'Nama' : 'Name'}</th>
              <th>{lang === 'id' ? 'Tipe' : 'Type'}</th>
              <th>{lang === 'id' ? 'Ukuran' : 'Size'}</th>
            </tr>
          </thead>
          <tbody>
            {greenhouses.map(gh => (
              <tr key={gh.id}>
                <td>{gh.name}</td>
                <td>{gh.type}</td>
                <td>{gh.size} m²</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
