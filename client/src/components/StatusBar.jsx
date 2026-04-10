export default function StatusBar({ loading, error }) {
  if (!loading && !error) return null;

  return (
    <div className="status-bar">
      {loading && (
        <div className="status-loading">
          <span className="spinner" />
          Loading…
        </div>
      )}
      {error && (
        <div className="status-error">
          ⚠ {error}
        </div>
      )}
    </div>
  );
}
