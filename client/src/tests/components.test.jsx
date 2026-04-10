import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import App from '../App';
import TaskForm from '../components/TaskForm';
import TaskItem from '../components/TaskItem';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeTask(overrides = {}) {
  return {
    id:        overrides.id        ?? crypto.randomUUID(),
    title:     overrides.title     ?? 'Test task',
    completed: overrides.completed ?? false,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  };
}

it('TaskForm calls onAdd with trimmed title and clears the input', () => {
  const onAdd = vi.fn();
  render(<TaskForm onAdd={onAdd} loading={false} />);
  const input = screen.getByPlaceholderText(/add a new task/i);
  fireEvent.change(input, { target: { value: '  Buy milk  ' } });
  fireEvent.submit(input.closest('form'));
  expect(onAdd).toHaveBeenCalledWith('Buy milk');
  expect(input.value).toBe('');
});

it('TaskForm disables the submit button while loading', () => {
  render(<TaskForm onAdd={vi.fn()} loading={true} />);
  expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
});

it('TaskItem renders title, checkbox state, and calls onToggle correctly', () => {
  const onToggle = vi.fn();
  const task = makeTask({ title: 'Walk the dog', completed: false });
  render(<TaskItem task={task} onToggle={onToggle} onDelete={vi.fn()} onEdit={vi.fn()} loading={false} />);
  expect(screen.getByText('Walk the dog')).toBeInTheDocument();
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  fireEvent.click(screen.getByRole('checkbox'));
  expect(onToggle).toHaveBeenCalledWith(task.id, true);
});

it('App fetches tasks on mount and renders them', async () => {
  const tasks = [makeTask({ title: 'Fetched task' })];
  global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => tasks });
  render(<App />);
  await waitFor(() => expect(screen.getByText('Fetched task')).toBeInTheDocument());
});

it('App shows error message when fetch fails', async () => {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: false,
    json: async () => ({ error: 'Server error' }),
  });
  render(<App />);
  await waitFor(() => expect(screen.getByText(/server error/i)).toBeInTheDocument());
});
