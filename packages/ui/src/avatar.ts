const CATEGORY_COLORS: Record<string, string> = {
  AI: '#7c5cd6',
  DevTools: '#4a90d9',
  Fintech: '#2f9e6e',
  Design: '#d65c9c',
  Consumer: '#e0703a',
  Enterprise: '#3f6fb5',
  Infra: '#e8912d',
  Landmark: '#c0553b',
  Public: '#5b7285',
  Neighborhood: '#6a8f5f',
};

export function avatarColor(category: string | undefined): string {
  return (category && CATEGORY_COLORS[category]) || '#7a828e';
}

export function avatarLetter(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}
