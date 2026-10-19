/** Reserve explicit IDs before allocating deterministic fallback IDs. Browser-safe. */
export function createFallbackIds<T extends { id?: string }>(
  roots: T[], children: (node: T) => T[],
): (base: string) => string {
  const used = new Set<string>();
  const reserve = (node: T): void => {
    if (node.id != null) used.add(node.id);
    children(node).forEach(reserve);
  };
  roots.forEach(reserve);
  return (base) => {
    let id = base;
    let suffix = 1;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    return id;
  };
}
