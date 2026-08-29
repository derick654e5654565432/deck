import { STATUS_META } from './constants.js';

export default function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.idea;
  return (
    <span className="badge" style={{ '--dot': meta.color }}>
      <span className="badge-dot" />
      {meta.label}
    </span>
  );
}
