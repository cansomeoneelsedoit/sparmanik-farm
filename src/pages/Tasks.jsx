import React, { useState } from 'react';
import tasks from '../data/tasks';

export default function Tasks({ lang = 'en' }) {
  const [filter, setFilter] = useState('all');

  const title = lang === 'id' ? 'Tugas' : 'Tasks';
  const filterLabels = {
    en: { all: 'All', pending: 'Pending', in_progress: 'In Progress', completed: 'Completed' },
    id: { all: 'Semua', pending: 'Menunggu', in_progress: 'Sedang Berjalan', completed: 'Selesai' }
  };
  const labels = filterLabels[lang] || filterLabels['en'];

  const filteredTasks = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);

  const getPriorityBadgeClass = (priority) => {
    if (priority === 'high') return 'badge-red';
    if (priority === 'medium') return 'badge-yellow';
    return 'badge-blue';
  };

  const getStatusBadgeClass = (status) => {
    if (status === 'completed') return 'badge-green';
    if (status === 'in_progress') return 'badge-yellow';
    return 'badge-blue';
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US');
  };

  const getCommentCount = (comments) => {
    if (Array.isArray(comments)) return comments.length;
    if (typeof comments === 'number') return comments;
    return 0;
  };

  return (
    <div className="tasks-page">
      <h1 className="page-title">{title}</h1>

      <div className="filter-bar">
        {['all', 'pending', 'in_progress', 'completed'].map((f) => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {labels[f]}
          </button>
        ))}
      </div>

      <div className="tasks-grid">
        {filteredTasks.map((task) => (
          <div key={task.id} className="card task-card">
            <div className="task-header">
              <h3>{task.title}</h3>
              <span className={`task-status-badge ${getStatusBadgeClass(task.status)}`}>
                {task.status === 'completed' ? 'Done' : task.status === 'in_progress' ? 'In Progress' : 'Pending'}
              </span>
            </div>

            <p className="task-assignee">{lang === 'id' ? 'Ditugaskan ke: ' : 'Assigned to: '}{task.assignee}</p>
            <p className="task-due-date">{lang === 'id' ? 'Tenggat: ' : 'Due: '}{formatDate(task.dueDate)}</p>

            <div className="task-footer">
              <span className={`task-priority-badge ${getPriorityBadgeClass(task.priority)}`}>
                {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
              </span>
              {getCommentCount(task.comments) > 0 && (
                <span className="task-comments">{getCommentCount(task.comments)} {lang === 'id' ? 'komentar' : 'comments'}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
