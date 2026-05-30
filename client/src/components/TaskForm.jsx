import { useState } from 'react';

export default function TaskForm({ onAdd, loading }) {
  const [title, setTitle] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (title.trim()) {
      onAdd(title.trim());
      setTitle('');
    }
  }

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      <div className="task-form-field">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a new task…"
          aria-label="New task title"
        />
      </div>
      <button className="btn-add" type="submit" disabled={loading}>
        + Add
      </button>
    </form>
  );
}
