export function matchingSpoodNames(names: string[], query: string): string[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return [...new Set(names)].filter(name => name.toLocaleLowerCase().includes(needle)).slice(0, 8);
}
