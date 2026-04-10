import { useState, useEffect } from 'react';
import StatusBar from './components/StatusBar';
import TaskForm from './components/TaskForm';
import TaskList from './components/TaskList';

function App() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function fetchTasks() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/tasks');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Request failed');
      }
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function addTask(title) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Request failed');
      }
      const newTask = await res.json();
      setTasks((prev) => [...prev, newTask]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleTask(id, completed) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Request failed');
      }
      const updatedTask = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === id ? updatedTask : t)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteTask(id) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/tasks/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Request failed');
      }
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTasks();
  }, []);

  const completed = tasks.filter((t) => t.completed).length;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Task Manager</h1>
        <p>Stay on top of what matters</p>
      </header>
      <StatusBar loading={loading} error={error} />
      <TaskForm onAdd={addTask} loading={loading} />
      <TaskList tasks={tasks} onToggle={toggleTask} onDelete={deleteTask} loading={loading} />
      {tasks.length > 0 && (
        <p className="task-stats">{completed} of {tasks.length} completed</p>
      )}
    </div>
  );
}

export default App;
