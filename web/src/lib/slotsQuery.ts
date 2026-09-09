import { queryOptions } from '@tanstack/react-query';
import { getSlotsForDate } from './slotsApi';

export const slotsQueryOptions = (date: string) =>
  queryOptions({
    queryKey: ['slots', date],
    queryFn: () => getSlotsForDate({ data: date }),
    staleTime: 30_000,
    refetchInterval: 5 * 60_000, // keep the grid fresh; the worker repolls every 5 min
  });
