import TaskItem from './TaskItem';

export default function TaskList({ tasks, onToggle, onDelete, loading }) {
  if (tasks.length === 0) {
    return (
      <div className="task-list-empty">
        <p>No tasks yet.</p>
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
          loading={loading}
        />
      ))}
    </ul>
  );
}
