export default function FilterBar({ filter, onChange, counts }) {
  const options = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'completed', label: 'Done' },
  ];

  return (
    <div className="filter-bar">
      {options.map(({ key, label }) => (
        <button
          key={key}
          className={`filter-btn${filter === key ? ' active' : ''}`}
          onClick={() => onChange(key)}
        >
          {label}
          <span className="filter-count">{counts[key]}</span>
        </button>
      ))}
    </div>
  );
}
