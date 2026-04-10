import { useState, useEffect } from 'react';
import StatusBar from './components/StatusBar';
import TaskForm from './components/TaskForm';
import TaskList from './components/TaskList';
import FilterBar from './components/FilterBar';
import { apiFetch } from './api';

function App() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'active' | 'completed'

  async function fetchTasks() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/tasks');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Request failed');
      }
      setTasks(await res.json());
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
      const res = await apiFetch('/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
      const newTask = await res.json();
      setTasks((prev) => [...prev, newTask]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function editTask(id, title) {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
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
      const res = await apiFetch(`/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
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
      const res = await apiFetch(`/tasks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTasks(); }, []);

  const completedCount = tasks.filter((t) => t.completed).length;
  const filteredTasks = tasks.filter((t) => {
    if (filter === 'active') return !t.completed;
    if (filter === 'completed') return t.completed;
    return true;
  });

  return (
    <div className="app">
      <header className="app-header">
        <h1>Task Manager</h1>
      </header>
      <StatusBar loading={loading} error={error} />
      <TaskForm onAdd={addTask} loading={loading} />
      {tasks.length > 0 && (
        <FilterBar filter={filter} onChange={setFilter} counts={{
          all: tasks.length,
          active: tasks.length - completedCount,
          completed: completedCount,
        }} />
      )}
      <TaskList
        tasks={filteredTasks}
        onToggle={toggleTask}
        onDelete={deleteTask}
        onEdit={editTask}
        loading={loading}
        filter={filter}
      />
      {tasks.length > 0 && (
        <p className="task-stats">{completedCount} of {tasks.length} completed</p>
      )}
    </div>
  );
}

export default App;
