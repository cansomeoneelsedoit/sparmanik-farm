import React, { useState } from 'react';
import tasks from '../data/tasks';

export default function Tasks({ lang = 'en' }) {
  const [filter, setFilter] = useState('all');

  const title = lang === 'id' ? 'Tugas' : 'Tasks';

  const filteredTasks = filter === 'all'
    ? tasks
    : tasks.filter(t => t.status === filter);

  function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getStatusLabel(status) {
    if (status === 'completed') return 'Done';
    if (status === 'in_progress') return 'In Progress';
    return 'Pending';
  }

  function getStatusBadge(status) {
    if (status === 'completed') return 'badge-green';
    if (status === 'in_progress') return 'badge-blue';
    return 'badge-yellow';
  }

  function getPriorityBadge(priority) {
    if (priority === 'high') return 'badge-red';
    if (priority === 'medium') return 'badge-yellow';
    return 'badge-blue';
  }

  return (
    <div>
      <h1 className="page-title">{title}</h1>

      <div className="filter-bar">
        {['all', 'pending', 'in_progress', 'completed'].map(f => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="tasks-grid">
        {filteredTasks.map(task => (
          <div key={task.id} className="card task-card">
            <div className="task-header">
              <h3>{task.title}</h3>
              <span className={getStatusBadge(task.status)}>{getStatusLabel(task.status)}</span>
            </div>
            <p className="task-assignee">{lang === 'id' ? 'Ditugaskan ke: ' : 'Assigned to: '}{task.assignee}</p>
            <p className="task-due-date">{lang === 'id' ? 'Tenggat: ' : 'Due: '}{formatDate(task.dueDate)}</p>
            <div className="task-footer">
              <span className={getPriorityBadge(task.priority)}>
                {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
              </span>
              {task.comments > 0 && (
                <span className="task-comments">{task.comments} {task.comments === 1 ? 'comment' : 'comments'}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
