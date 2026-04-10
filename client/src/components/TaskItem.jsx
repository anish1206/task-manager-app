import { useState, useRef, useEffect } from 'react';

export default function TaskItem({ task, onToggle, onDelete, onEdit, loading }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function startEdit() {
    setDraft(task.title);
    setEditing(true);
  }

  function commitEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== task.title) {
      onEdit(task.id, trimmed);
    }
    setEditing(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') setEditing(false);
  }

  return (
    <li className={`task-item${task.completed ? ' completed' : ''}`}>
      <input
        className="task-checkbox"
        type="checkbox"
        checked={task.completed}
        onChange={() => onToggle(task.id, !task.completed)}
        disabled={loading || editing}
        aria-label={`Mark "${task.title}" as ${task.completed ? 'incomplete' : 'complete'}`}
      />

      {editing ? (
        <input
          ref={inputRef}
          className="task-edit-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <span
          className="task-title"
          onDoubleClick={!loading ? startEdit : undefined}
          title="Double-click to edit"
        >
          {task.title}
        </span>
      )}

      <div className="task-actions">
        {!editing && (
          <button
            className="btn-edit"
            onClick={startEdit}
            disabled={loading}
            aria-label={`Edit "${task.title}"`}
          >
            Edit
          </button>
        )}
        <button
          className="btn-delete"
          onClick={() => onDelete(task.id)}
          disabled={loading || editing}
          aria-label={`Delete "${task.title}"`}
        >
          Delete
        </button>
      </div>
    </li>
  );
}
