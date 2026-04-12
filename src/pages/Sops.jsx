import React, { useState } from 'react';
import sops from '../data/sops';

export default function Sops({ lang = 'en' }) {
  const [expandedId, setExpandedId] = useState(null);

  const toggleExpanded = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="page">
      <h1 className="page-title">Standard Operating Procedures</h1>

      <div className="card-grid">
        {sops.map((sop, idx) => (
          <div key={idx} className="card">
            <div
              onClick={() => toggleExpanded(idx)}
              style={{ cursor: 'pointer', marginBottom: '8px' }}
            >
              <h3>{lang === 'id' ? sop.titleId : sop.title}</h3>
              <span className="badge-green">{sop.category}</span>
              <p>{lang === 'id' ? sop.descriptionId : sop.description}</p>
              <small>{sop.steps.length} steps</small>
            </div>

            {expandedId === idx && (
              <div style={{ marginTop: '12px', borderTop: '1px solid #ddd', paddingTop: '12px' }}>
                <ol>
                  {sop.steps.map((step, stepIdx) => (
                    <li key={stepIdx}>
                      {lang === 'id' ? step.textId : step.text}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
