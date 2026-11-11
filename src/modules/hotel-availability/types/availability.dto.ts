import type { z } from 'zod';
import type { Currency } from '../engine/stay-pricing';
import type {
  calendarRangeQuerySchema,
  calendarUpdateBodySchema,
} from '../util/availability.validation';

export type CalendarRangeQuery = z.output<typeof calendarRangeQuerySchema>;
export type CalendarUpdateBody = z.output<typeof calendarUpdateBodySchema>;
export type CalendarChange = CalendarUpdateBody['changes'][number];

export type MoneyRates = Record<Currency, string | null>;

export type RoomCalendarResponse = {
  hotel_id: string;
  room_id: string;
  revision: number;
  base_rates: MoneyRates;
  days: { date: string; available_units: number; rate_override: MoneyRates }[];
};

export type RoomCalendarUpdateResponse = {
  hotel_id: string;
  room_id: string;
  revision: number;
};
