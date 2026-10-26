const COLORS = ['#f5d547', '#7ab8ff', '#6fd3a0', '#ff9b85', '#c9a7ff', '#5fd0d8'];

export function Avatar({ name = '?', id = 0, size = 28 }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <span className="avatar" title={name} aria-label={name}
      style={{ width: size, height: size, fontSize: size * 0.4, background: COLORS[id % COLORS.length] }}>
      {initials}
    </span>
  );
}
