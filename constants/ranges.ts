export type BarRange = '3M' | '6M' | '1Y' | '2Y' | 'lifetime';

export interface TimeRangeOption {
  label: string;
  key: BarRange;
  months: number | null;
}

export const BAR_RANGES: TimeRangeOption[] = [
  { label: '3M', key: '3M', months: 3 },
  { label: '6M', key: '6M', months: 6 },
  { label: '1Y', key: '1Y', months: 12 },
  { label: '2Y', key: '2Y', months: 24 },
  { label: 'Lifetime', key: 'lifetime', months: null },
];
