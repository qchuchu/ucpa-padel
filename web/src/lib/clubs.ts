export type Club = { key: string; name: string; short: string };

// Mirrors the provider club lists in ../../src (isolated monorepo — kept in sync by hand).
export const CLUBS: Club[] = [
  { key: 'ucpa', name: 'UCPA Paris 19e - Rosa Parks', short: 'UCPA' },
  { key: 'trinquet', name: 'Trinquet Village - Paris 16e', short: 'Trinquet' },
  { key: 'padelistes', name: 'Padelistes Bercy - Paris 12e', short: 'Padelistes' },
  { key: '4padel20', name: '4PADEL - Paris 20e', short: '4Padel20' },
  { key: 'aquaboulevard', name: 'Forest Hill Aquaboulevard - Paris 15e', short: 'Aquaboul' },
  { key: 'parispadel', name: 'Paris Padel - Paris 20e', short: 'ParisPadel' },
  { key: 'padel15', name: 'Padel 15 - Paris 15e', short: 'Padel15' },
  { key: 'sportfield16', name: 'Sportfield Tour Eiffel - Paris 16e', short: 'Sportf16' },
  { key: 'sportfield12', name: 'Sportfield Bercy - Paris 12e', short: 'Sportf12' },
];

export const CLUB_BY_KEY: Record<string, Club> = Object.fromEntries(
  CLUBS.map((c) => [c.key, c]),
);

export function clubLabel(key: string): string {
  return CLUB_BY_KEY[key]?.short ?? key;
}
