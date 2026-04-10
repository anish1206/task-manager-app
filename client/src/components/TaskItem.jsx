export default function TaskItem({ task, onToggle, onDelete, loading }) {
  return (
    <li className={`task-item${task.completed ? ' completed' : ''}`}>
      <input
        className="task-checkbox"
        type="checkbox"
        checked={task.completed}
        onChange={() => onToggle(task.id, !task.completed)}
        disabled={loading}
        aria-label={`Mark "${task.title}" as ${task.completed ? 'incomplete' : 'complete'}`}
      />
      <span className="task-title">{task.title}</span>
      <button
        className="btn-delete"
        onClick={() => onDelete(task.id)}
        disabled={loading}
        aria-label={`Delete "${task.title}"`}
      >
        Delete
      </button>
    </li>
  );
}
