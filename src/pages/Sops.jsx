import React, { useState } from 'react';
import sops from '../data/sops';

export default function Sops({ lang = 'en' }) {
  const [expandedId, setExpandedId] = useState(null);

  const toggleExpanded = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div>
      <h1 className="page-title">{lang === 'id' ? 'Prosedur Operasi Standar' : 'Standard Operating Procedures'}</h1>

      {sops.map(sop => (
        <div
          key={sop.id}
          className="card"
          style={{ cursor: 'pointer' }}
          onClick={() => toggleExpanded(sop.id)}
        >
          <h3>{sop.icon} {lang === 'id' ? sop.titleId : sop.title}</h3>
          <p style={{ color: 'var(--text2)', fontSize: 13, margin: '8px 0' }}>
            {lang === 'id' ? sop.descriptionId : sop.description}
          </p>

          {expandedId === sop.id && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <ol style={{ paddingLeft: 20, color: 'var(--text2)', fontSize: 13, lineHeight: 2 }}>
                {(lang === 'id' ? sop.stepsId : sop.steps).map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      ))}

      <p style={{ color: 'var(--text2)', fontSize: 12 }}>
        {lang === 'id' ? 'Klik SOP untuk melihat langkah-langkah' : 'Click any SOP to expand steps'}
      </p>
    </div>
  );
}
