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
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a new task…"
      />
      <button className="btn-add" type="submit" disabled={loading}>
        + Add
      </button>
    </form>
  );
}
