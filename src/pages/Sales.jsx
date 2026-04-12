import React from 'react';
import harvests from '../data/harvests';

export default function Sales({ lang = 'en' }) {
  const allSales = [];
  harvests.forEach(harvest => {
    if (harvest.sales) {
      harvest.sales.forEach(sale => {
        allSales.push(sale);
      });
    }
  });

  function fmtIDR(n) {
    return 'Rp ' + Math.round(n).toLocaleString('id-ID');
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div>
      <h1 className="page-title">{lang === 'id' ? 'Penjualan' : 'Sales'}</h1>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{lang === 'id' ? 'Tanggal' : 'Date'}</th>
              <th>{lang === 'id' ? 'Produk' : 'Product'}</th>
              <th>{lang === 'id' ? 'Jumlah' : 'Qty'}</th>
              <th>{lang === 'id' ? 'Harga Satuan' : 'Unit Price'}</th>
              <th>Total</th>
              <th>{lang === 'id' ? 'Pembeli' : 'Buyer'}</th>
            </tr>
          </thead>
          <tbody>
            {allSales.map((sale, idx) => (
              <tr key={idx}>
                <td>{formatDate(sale.date)}</td>
                <td>{sale.product}</td>
                <td>{sale.qty}</td>
                <td>{fmtIDR(sale.unitPrice)}</td>
                <td>{fmtIDR(sale.amount)}</td>
                <td>{sale.buyer}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
