import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { AuthProvider } from '../context/AuthContext';
import TaskForm from '../components/TaskForm';
import TaskItem from '../components/TaskItem';
import TaskList from '../components/TaskList';
import FilterBar from '../components/FilterBar';
import StatusBar from '../components/StatusBar';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  global.fetch = vi.fn();
});

function makeTask(overrides = {}) {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    title: overrides.title ?? 'Test task',
    completed: overrides.completed ?? false,
    created_at: overrides.created_at ?? new Date().toISOString(),
    updated_at: overrides.updated_at ?? new Date().toISOString(),
  };
}

const testUser = { id: 'test-user-id', email: 'test@example.com' };

function mockAuthSession() {
  return { ok: true, json: async () => testUser };
}

function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

describe('TaskForm', () => {
  it('calls onAdd with trimmed title and clears the input', async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<TaskForm onAdd={onAdd} loading={false} />);
    
    const input = screen.getByPlaceholderText(/add a new task/i);
    await user.type(input, '  Buy milk  ');
    await user.click(screen.getByRole('button', { name: /add/i }));
    
    expect(onAdd).toHaveBeenCalledWith('Buy milk');
    expect(input.value).toBe('');
  });

  it('does not submit empty or whitespace-only titles', async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<TaskForm onAdd={onAdd} loading={false} />);
    
    const input = screen.getByPlaceholderText(/add a new task/i);
    await user.type(input, '   ');
    await user.click(screen.getByRole('button', { name: /add/i }));
    
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('disables the submit button while loading', () => {
    render(<TaskForm onAdd={vi.fn()} loading={true} />);
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
  });

  it('allows keyboard submission with Enter key', async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<TaskForm onAdd={onAdd} loading={false} />);
    
    const input = screen.getByPlaceholderText(/add a new task/i);
    await user.type(input, 'New task{Enter}');
    
    expect(onAdd).toHaveBeenCalledWith('New task');
  });
});

describe('TaskItem', () => {
  it('renders title, checkbox state, and calls onToggle correctly', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    const task = makeTask({ title: 'Walk the dog', completed: false });
    
    render(<TaskItem task={task} onToggle={onToggle} onDelete={vi.fn()} onEdit={vi.fn()} loading={false} />);
    
    expect(screen.getByText('Walk the dog')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    
    await user.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith(task.id, true);
  });

  it('shows completed styling for completed tasks', () => {
    const task = makeTask({ title: 'Completed task', completed: true });
    render(<TaskItem task={task} onToggle={vi.fn()} onDelete={vi.fn()} onEdit={vi.fn()} loading={false} />);
    
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('calls onDelete when delete button is clicked', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    const task = makeTask();
    
    render(<TaskItem task={task} onToggle={vi.fn()} onDelete={onDelete} onEdit={vi.fn()} loading={false} />);
    
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await user.click(deleteButton);
    
    expect(onDelete).toHaveBeenCalledWith(task.id);
  });

  it('disables actions while loading', () => {
    const task = makeTask();
    render(<TaskItem task={task} onToggle={vi.fn()} onDelete={vi.fn()} onEdit={vi.fn()} loading={true} />);
    
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();
  });
});

describe('TaskList', () => {
  it('renders multiple tasks', () => {
    const tasks = [
      makeTask({ id: '1', title: 'Task 1' }),
      makeTask({ id: '2', title: 'Task 2' }),
      makeTask({ id: '3', title: 'Task 3' }),
    ];
    
    render(<TaskList tasks={tasks} onToggle={vi.fn()} onDelete={vi.fn()} onEdit={vi.fn()} loading={false} filter="all" />);
    
    expect(screen.getByText('Task 1')).toBeInTheDocument();
    expect(screen.getByText('Task 2')).toBeInTheDocument();
    expect(screen.getByText('Task 3')).toBeInTheDocument();
  });

  it('shows empty state when no tasks', () => {
    render(<TaskList tasks={[]} onToggle={vi.fn()} onDelete={vi.fn()} onEdit={vi.fn()} loading={false} filter="all" />);
    
    expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument();
  });

  it('shows filtered empty state', () => {
    render(<TaskList tasks={[]} onToggle={vi.fn()} onDelete={vi.fn()} onEdit={vi.fn()} loading={false} filter="completed" />);
    
    expect(screen.getByText(/no completed tasks/i)).toBeInTheDocument();
  });
});

describe('FilterBar', () => {
  it('renders all filter options with counts', () => {
    const counts = { all: 10, active: 6, completed: 4 };
    render(<FilterBar filter="all" onChange={vi.fn()} counts={counts} />);
    
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('calls onChange when filter is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const counts = { all: 10, active: 6, completed: 4 };
    
    render(<FilterBar filter="all" onChange={onChange} counts={counts} />);
    
    await user.click(screen.getByText(/active/i));
    expect(onChange).toHaveBeenCalledWith('active');
  });

  it('highlights the active filter', () => {
    const counts = { all: 10, active: 6, completed: 4 };
    render(<FilterBar filter="active" onChange={vi.fn()} counts={counts} />);
    
    const activeButton = screen.getByText(/active/i).closest('button');
    expect(activeButton).toHaveClass('active');
  });
});

describe('StatusBar', () => {
  it('shows loading state', () => {
    render(<StatusBar loading={true} error={null} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows error message', () => {
    render(<StatusBar loading={false} error="Something went wrong" />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('shows nothing when not loading and no error', () => {
    const { container } = render(<StatusBar loading={false} error={null} />);
    // StatusBar returns null when not loading and no error
    expect(container.firstChild).toBeNull();
  });
});

describe('App Integration', () => {
  it('fetches tasks on mount and renders them', async () => {
    const tasks = [makeTask({ title: 'Fetched task' })];
    global.fetch
      .mockResolvedValueOnce(mockAuthSession())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: tasks }) });
    
    renderApp();
    
    await waitFor(() => expect(screen.getByText('Fetched task')).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalled();
  });

  it('shows error message when fetch fails', async () => {
    global.fetch
      .mockResolvedValueOnce(mockAuthSession())
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Server error' }),
      });
    
    renderApp();
    
    await waitFor(() => expect(screen.getByText(/server error/i)).toBeInTheDocument());
  });

  it('adds a new task', async () => {
    const existingTasks = [makeTask({ id: '1', title: 'Existing task' })];
    const newTask = makeTask({ id: '2', title: 'New task' });
    
    global.fetch
      .mockResolvedValueOnce(mockAuthSession())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: existingTasks }) })
      .mockResolvedValueOnce({ ok: true, json: async () => newTask });
    
    const user = userEvent.setup();
    renderApp();
    
    await waitFor(() => expect(screen.getByText('Existing task')).toBeInTheDocument());
    
    const input = screen.getByPlaceholderText(/add a new task/i);
    await user.type(input, 'New task');
    await user.click(screen.getByRole('button', { name: /add/i }));
    
    await waitFor(() => expect(screen.getByText('New task')).toBeInTheDocument());
  });

  it('toggles task completion', async () => {
    const task = makeTask({ id: '1', title: 'Toggle me', completed: false });
    const updatedTask = { ...task, completed: true };
    
    global.fetch
      .mockResolvedValueOnce(mockAuthSession())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [task] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => updatedTask });
    
    const user = userEvent.setup();
    renderApp();
    
    await waitFor(() => expect(screen.getByText('Toggle me')).toBeInTheDocument());
    
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    
    await user.click(checkbox);
    
    await waitFor(() => expect(checkbox).toBeChecked());
  });

  it('deletes a task', async () => {
    const tasks = [
      makeTask({ id: '1', title: 'Keep me' }),
      makeTask({ id: '2', title: 'Delete me' }),
    ];
    
    global.fetch
      .mockResolvedValueOnce(mockAuthSession())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: tasks }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    
    const user = userEvent.setup();
    renderApp();
    
    await waitFor(() => expect(screen.getByText('Delete me')).toBeInTheDocument());
    
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    await user.click(deleteButtons[1]);
    
    await waitFor(() => expect(screen.queryByText('Delete me')).not.toBeInTheDocument());
    expect(screen.getByText('Keep me')).toBeInTheDocument();
  });

  it('filters tasks correctly', async () => {
    const tasks = [
      makeTask({ id: '1', title: 'Active task', completed: false }),
      makeTask({ id: '2', title: 'Completed task', completed: true }),
    ];
    
    global.fetch
      .mockResolvedValueOnce(mockAuthSession())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: tasks }) });
    
    const user = userEvent.setup();
    renderApp();
    
    await waitFor(() => expect(screen.getByText('Active task')).toBeInTheDocument());
    
    // Both visible initially
    expect(screen.getByText('Active task')).toBeInTheDocument();
    expect(screen.getByText('Completed task')).toBeInTheDocument();
    
    // Filter to active only - click the button, not the text
    const activeButton = screen.getAllByRole('button').find(btn => btn.textContent.includes('Active') && btn.classList.contains('filter-btn'));
    await user.click(activeButton);
    expect(screen.getByText('Active task')).toBeInTheDocument();
    expect(screen.queryByText('Completed task')).not.toBeInTheDocument();
    
    // Filter to completed only
    const completedButton = screen.getAllByRole('button').find(btn => btn.textContent.includes('Done'));
    await user.click(completedButton);
    expect(screen.queryByText('Active task')).not.toBeInTheDocument();
    expect(screen.getByText('Completed task')).toBeInTheDocument();
  });

  it('displays task statistics', async () => {
    const tasks = [
      makeTask({ completed: false }),
      makeTask({ completed: false }),
      makeTask({ completed: true }),
    ];
    
    global.fetch
      .mockResolvedValueOnce(mockAuthSession())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: tasks }) });
    
    renderApp();
    
    await waitFor(() => expect(screen.getByText(/1 of 3 completed/i)).toBeInTheDocument());
  });
});
