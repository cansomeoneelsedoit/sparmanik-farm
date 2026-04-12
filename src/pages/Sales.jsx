import React, { useMemo } from 'react';
import harvests from '../data/harvests';
import produce from '../data/produce';

export default function Sales({ lang = 'en' }) {
  const salesData = useMemo(() => {
    const sales = [];
    harvests.forEach(harvest => {
      if (harvest.sales && harvest.sales.length > 0) {
        harvest.sales.forEach(sale => {
          const prod = produce.find(p => p.id === sale.produceId);
          sales.push({
            date: harvest.date,
            produce: prod?.name || '—',
            grade: sale.grade || '—',
            weight: sale.weight || 0,
            pricePerKg: sale.pricePerKg || 0,
            amount: (sale.weight || 0) * (sale.pricePerKg || 0)
          });
        });
      }
    });
    return sales;
  }, []);

  return (
    <div className="page">
      <h1 className="page-title">Sales</h1>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Produce</th>
              <th>Grade</th>
              <th>Weight (kg)</th>
              <th>Price/kg (IDR)</th>
              <th>Amount (IDR)</th>
            </tr>
          </thead>
          <tbody>
            {salesData.map((sale, idx) => (
              <tr key={idx}>
                <td>{sale.date}</td>
                <td>{sale.produce}</td>
                <td>{sale.grade}</td>
                <td>{sale.weight.toFixed(2)}</td>
                <td>{sale.pricePerKg.toLocaleString('id-ID')}</td>
                <td>{sale.amount.toLocaleString('id-ID')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
