import React from 'react';
import videos from '../data/videos';

export default function Videos({ lang = 'en' }) {
  return (
    <div className="page">
      <h1 className="page-title">Training Videos</h1>

      <div className="card-grid">
        {videos.map((video, idx) => (
          <div key={idx} className="card">
            <h3>{lang === 'id' ? video.titleId : video.title}</h3>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <span className="badge-blue">{video.category}</span>
              <span className="badge-green">{video.type}</span>
            </div>
            <p><strong>Duration:</strong> {video.duration}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
