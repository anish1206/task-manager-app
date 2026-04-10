import TaskItem from './TaskItem';

export default function TaskList({ tasks, onToggle, onDelete, onEdit, loading, filter }) {
  if (tasks.length === 0) {
    const msg = filter === 'active'
      ? 'No active tasks — nice work!'
      : filter === 'completed'
      ? 'No completed tasks yet.'
      : 'No tasks yet. Add one above!';

    return (
      <div className="task-list-empty">
        <p>{msg}</p>
      </div>
    );
  }

  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          onToggle={onToggle}
          onDelete={onDelete}
          onEdit={onEdit}
          loading={loading}
        />
      ))}
    </ul>
  );
}
