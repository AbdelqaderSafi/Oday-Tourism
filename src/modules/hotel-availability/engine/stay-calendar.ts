import type { Cents } from './money';
import { chooseAllocation } from './room-allocation';
import { Currency, roomStayTerms, RoomTypeStock } from './stay-pricing';

export type NightOffer = {
  date: string;
  available: boolean;
  total: Cents | null;
};

// Each night is an independent one-night stay for the whole party, priced like a stay quote without rooms.
export function nightOffers(
  rooms: RoomTypeStock[],
  dates: string[],
  guests: number,
  currency: Currency,
): NightOffer[] {
  return dates.map((date) => {
    const terms = rooms
      .map((room) => roomStayTerms(room, [date], guests, currency))
      .filter((roomTerms) => roomTerms.maxQuantity >= 1);
    const allocation = chooseAllocation(terms, guests);
    return {
      date,
      available: allocation !== null,
      total: allocation?.total ?? null,
    };
  });
}
