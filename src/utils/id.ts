let counter = 0;

export function createId(prefix = 'mf'): string {
  counter += 1;
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${counter}_${rand}`;
}
