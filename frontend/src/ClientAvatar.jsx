import { clientLogoUrl } from './constants.js';

// Shows a client's logo, or their initials in a coloured circle if no logo.
// Deterministic colour from the name so each client reads consistently.
const COLORS = ['#7c8cf8', '#4cc38a', '#e8853a', '#2fd4a7', '#e8636b', '#c07cf8', '#e8c13a', '#5aa9e6'];

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(name) {
  let h = 0;
  for (let i = 0; i < String(name).length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export default function ClientAvatar({ client, size = 22 }) {
  if (!client) return null;
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (client.has_logo) {
    return <img className="client-avatar" style={style} src={clientLogoUrl(client.id, client.updated_at)} alt={client.name} />;
  }
  return (
    <span className="client-avatar initials" style={{ ...style, background: colorFor(client.name) }}>
      {initials(client.name)}
    </span>
  );
}
