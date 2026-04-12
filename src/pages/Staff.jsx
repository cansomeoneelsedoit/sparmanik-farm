import React from 'react';
import staff from '../data/staff';

export default function Staff({ lang = 'en' }) {
  const title = lang === 'id' ? 'Staf' : 'Staff';

  const formatRate = (rate) => {
    return 'Rp ' + rate.toLocaleString('id-ID') + '/hr';
  };

  const getInitials = (name) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  };

  const getCurrentRate = (member) => {
    if (member.rates && member.rates.length > 0) {
      return member.rates[member.rates.length - 1].rate;
    }
    return member.hourly_rate || 0;
  };

  return (
    <div className="staff-page">
      <h1 className="page-title">{title}</h1>
      <div className="staff-grid">
        {staff.map((member) => (
          <div key={member.id} className="card staff-card">
            <div className="staff-avatar" style={{ backgroundColor: '#ff9800' }}>
              {member.avatar || getInitials(member.name)}
            </div>
            <h3>{member.name}</h3>
            <p className="staff-role">{member.role}</p>
            <p className="staff-rate">{formatRate(getCurrentRate(member))}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
