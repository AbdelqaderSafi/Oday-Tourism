import type { z } from 'zod';
import type { HotelCatalogEntry } from 'src/modules/hotel/util/hotel-catalog';
import type { PaginatedResult } from 'src/types/util.types';
import type { Currency, VisitorCategory } from '../engine/stay-pricing';
import type {
  calendarRangeQuerySchema,
  calendarUpdateBodySchema,
  staySearchQuerySchema,
  stayQuoteBodySchema,
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

export type StaySearchQuery = z.output<typeof staySearchQuerySchema>;
export type StayQuoteBody = z.output<typeof stayQuoteBodySchema>;
export type PricingStatus = 'PRICED' | 'ON_REQUEST';

export type StayOffer = {
  nights: number;
  currency: Currency;
  pricing_status: PricingStatus;
  total: string | null;
  rooms: { room_id: string; quantity: number }[];
};

export type StaySearchResponse = PaginatedResult<{
  hotel: HotelCatalogEntry;
  stay_offer: StayOffer;
}>;

export type StayQuoteResponse = {
  hotel_id: string;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  nights: number;
  visitor_category: VisitorCategory;
  currency: Currency;
  pricing_status: PricingStatus;
  available_room_types: {
    room_id: string;
    capacity: number;
    max_quantity: number;
    unit_stay_total: string | null;
  }[];
  rooms: {
    room_id: string;
    quantity: number;
    subtotal: string | null;
    nightly_rates: { date: string; unit_rate: string | null }[];
  }[];
  addons: {
    addon_id: string;
    quantity: number;
    unit_rate: string | null;
    subtotal: string | null;
  }[];
  room_total: string | null;
  addons_total: string | null;
  total: string | null;
  quoted_at: string;
};
