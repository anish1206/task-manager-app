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
      <nav className="app-nav" aria-label="Primary">
        <span className="app-nav-brand">Task Manager</span>
        <span className="app-nav-meta">Midnight Command</span>
      </nav>

      <header className="app-hero">
        <div className="app-hero-inner">
          <span className="hero-badge">Productivity</span>
          <h1>Your tasks, organized</h1>
          <p className="hero-sub">Track, complete, and filter what matters.</p>
        </div>
      </header>

      <main className="app-main">
        <section className="app-section" aria-label="Status">
          <StatusBar loading={loading} error={error} />
        </section>

        <section className="app-section" aria-labelledby="add-task-label">
          <h2 id="add-task-label" className="section-label">Add task</h2>
          <TaskForm onAdd={addTask} loading={loading} />
        </section>

        {tasks.length > 0 && (
          <section className="app-section" aria-labelledby="filter-label">
            <h2 id="filter-label" className="section-label">Filter</h2>
            <FilterBar
              filter={filter}
              onChange={setFilter}
              counts={{
                all: tasks.length,
                active: tasks.length - completedCount,
                completed: completedCount,
              }}
            />
          </section>
        )}

        <section className="app-section" aria-labelledby="tasks-label">
          <h2 id="tasks-label" className="section-label">Tasks</h2>
          <TaskList
            tasks={filteredTasks}
            onToggle={toggleTask}
            onDelete={deleteTask}
            onEdit={editTask}
            loading={loading}
            filter={filter}
          />
        </section>
      </main>

      {tasks.length > 0 && (
        <footer className="app-footer">
          <div className="app-footer-inner">
            <p className="task-stats">{completedCount} of {tasks.length} completed</p>
          </div>
        </footer>
      )}
    </div>
  );
}

export default App;
