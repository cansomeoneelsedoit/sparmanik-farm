import React from 'react';
import videos from '../data/videos';

export default function Videos({ lang = 'en' }) {
  return (
    <div>
      <h1 className="page-title">{lang === 'id' ? 'Video Pelatihan' : 'Training Videos'}</h1>

      <div className="harvest-grid">
        {videos.map(video => (
          <div key={video.id} className="card">
            <h3 style={{ marginBottom: 8 }}>
              {"\u{1F3A5}"} {lang === 'id' ? video.titleId : video.title}
            </h3>
            <p style={{ color: 'var(--text2)', fontSize: 12 }}>
              Duration: {video.duration} min &middot; Category: {video.category}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
