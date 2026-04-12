import React from 'react';

export default function Recipes({ lang = 'en' }) {
  return (
    <div className="page">
      <h1 className="page-title">Nutrient Recipes</h1>

      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ fontSize: '18px', color: '#666' }}>
          {lang === 'id' ? 'Belum ada resep' : 'No recipes yet'}
        </p>
      </div>
    </div>
  );
}
