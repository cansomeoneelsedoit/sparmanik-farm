import React from 'react';
import staff from '../data/staff';

export default function Staff({ lang = 'en' }) {
  const title = lang === 'id' ? 'Staf' : 'Staff';

  const getCurrentRate = (member) => {
    if (member.rates && member.rates.length > 0) {
      return member.rates[member.rates.length - 1].rate;
    }
    return 0;
  };

  return (
    <div>
      <h1 className="page-title">{title}</h1>
      <div className="staff-grid">
        {staff.map(member => (
          <div key={member.id} className="card staff-card">
            <div className="staff-avatar">{member.avatar}</div>
            <h3>{member.name}</h3>
            <p className="staff-role">{member.role}</p>
            <p className="staff-rate">Rp {getCurrentRate(member).toLocaleString('id-ID')}/hr</p>
          </div>
        ))}
      </div>
    </div>
  );
}
