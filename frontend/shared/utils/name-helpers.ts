/**
 * Shared name / string helpers for display names, initials, and avatar text.
 */

/**
 * Extracts up to 2 initials from a full name.
 * "Ravi Sharma" → "RS", "Amit" → "A", "" → "?"
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
