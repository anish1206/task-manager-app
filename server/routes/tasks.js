const router = require('express').Router();
const { load, save } = require('../store');

let tasks = load();

// GET /tasks — return all tasks
router.get('/', (req, res) => {
  res.status(200).json(tasks);
});

// POST /tasks — create a new task
router.post('/', (req, res) => {
  const { title } = req.body;

  //Validate title is a non-empty, non whitespace string
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required and must be a non empty string.' });
  }

  // Create task and push to store
  const task = {
    id: crypto.randomUUID(),
    title: title.trim(),
    completed: false,
    createdAt: new Date().toISOString(),
  };

  tasks.push(task);
  save(tasks);
  res.status(201).json(task);
});

// PATCH /tasks/:id — update completed field
router.patch('/:id', (req, res) => {
  const task = tasks.find(t => t.id === req.params.id);

  if (!task) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  task.completed = req.body.completed;
  save(tasks);
  res.status(200).json(task);
});

// DELETE /tasks/:id — remove a task
router.delete('/:id', (req, res) => {
  const index = tasks.findIndex(t => t.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  tasks.splice(index, 1);
  save(tasks);
  res.status(204).send();
});

function resetTasks(initial) {
  tasks.length = 0;
  if (initial) tasks.push(...initial);
  // don't persist during tests
}

module.exports = router;
module.exports.resetTasks = resetTasks;
