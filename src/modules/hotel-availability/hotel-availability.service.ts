import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { DatabaseService } from '../database/database.service';
import { HOTEL_CATALOG_INCLUDE } from '../hotel/util/hotel-catalog';
import { Cents, formatAmountOrNull, parseAmount } from './engine/money';
import {
  chooseAllocation,
  compareIds,
  isSelectionFeasible,
  RoomPick,
} from './engine/room-allocation';
import { stayNights } from './engine/stay-dates';
import {
  Currency,
  priceStay,
  roomStayTerms,
  RoomStayTerms,
  UpgradeSelection,
  VISITOR_CURRENCY,
  VisitorCategory,
} from './engine/stay-pricing';
import type {
  PricingStatus,
  StayQuoteBody,
  StayQuoteResponse,
  StaySearchQuery,
  StaySearchResponse,
} from './types/availability.dto';
import { notFound, stayUnavailable } from './util/availability.errors';
import {
  ELIGIBLE_ROOM_WHERE,
  loadRoomNights,
  RoomNights,
  STOCK_ROOM_SELECT,
  StockRoom,
  toRoomStock,
} from './util/availability.queries';
import { UUID_PATTERN } from './util/availability.validation';

type StayRequest = {
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  visitor_category: VisitorCategory;
};
type Stay = { nights: string[]; guests: number; currency: Currency };
type AddonPrice = {
  id: string;
  price: Prisma.Decimal;
  price_egp: Prisma.Decimal | null;
};

const toStay = (request: StayRequest): Stay => ({
  nights: stayNights(request.check_in, request.check_out),
  guests: request.adults + request.children,
  currency: VISITOR_CURRENCY[request.visitor_category],
});

const pricingStatus = (total: Cents | null): PricingStatus =>
  total === null ? 'ON_REQUEST' : 'PRICED';

const toRoomQuantity = (pick: RoomPick) => ({
  room_id: pick.roomId,
  quantity: pick.quantity,
});

function availableTerms(
  rooms: StockRoom[],
  roomNights: RoomNights,
  stay: Stay,
): RoomStayTerms[] {
  return rooms
    .map((room) =>
      roomStayTerms(
        toRoomStock(room, roomNights),
        stay.nights,
        stay.guests,
        stay.currency,
      ),
    )
    .filter((terms) => terms.maxQuantity >= 1)
    .sort((a, b) => compareIds(a.roomId, b.roomId));
}

function exactRooms(
  selection: NonNullable<StayQuoteBody['rooms']>,
  terms: RoomStayTerms[],
  guests: number,
): RoomPick[] {
  const rooms = selection
    .map(({ room_id, quantity }) => ({ roomId: room_id, quantity }))
    .sort((a, b) => compareIds(a.roomId, b.roomId));
  if (!isSelectionFeasible(rooms, terms, guests))
    throw stayUnavailable('rooms');
  return rooms;
}

function recommendedRooms(terms: RoomStayTerms[], guests: number): RoomPick[] {
  const allocation = chooseAllocation(terms, guests);
  if (!allocation) throw stayUnavailable();
  return allocation.rooms;
}

function selectedUpgrades(
  selection: NonNullable<StayQuoteBody['addons']>,
  addons: AddonPrice[],
  currency: Currency,
): UpgradeSelection[] {
  const addonsById = new Map(addons.map((addon) => [addon.id, addon]));
  return selection
    .map(({ addon_id, quantity }) => {
      const addon = addonsById.get(addon_id);
      if (!addon) throw stayUnavailable('addons');
      const price = currency === 'USD' ? addon.price : addon.price_egp;
      return {
        addonId: addon_id,
        quantity,
        unitRate: price === null ? null : parseAmount(price.toFixed(2)),
      };
    })
    .sort((a, b) => compareIds(a.addonId, b.addonId));
}

@Injectable()
export class HotelAvailabilityService {
  constructor(private readonly prismaService: DatabaseService) {}

  async search(query: StaySearchQuery): Promise<StaySearchResponse> {
    const stay = toStay(query);
    const hotels = await this.prismaService.hotels.findMany({
      where: { destination: query.destination, is_deleted: false },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        rooms: { where: ELIGIBLE_ROOM_WHERE, select: STOCK_ROOM_SELECT },
      },
    });
    const roomIds = hotels.flatMap((hotel) =>
      hotel.rooms.map((room) => room.id),
    );
    const roomNights = await loadRoomNights(
      this.prismaService,
      roomIds,
      query.check_in,
      query.check_out,
      { openOnly: true },
    );
    const offers = hotels.flatMap((hotel) => {
      const allocation = chooseAllocation(
        availableTerms(hotel.rooms, roomNights, stay),
        stay.guests,
      );
      return allocation ? [{ hotelId: hotel.id, allocation }] : [];
    });

    const { skip, take, page } =
      this.prismaService.handleQueryPagination(query);
    const pageOffers = offers.slice(skip, skip + take);
    const catalog = pageOffers.length
      ? await this.prismaService.hotels.findMany({
          where: { id: { in: pageOffers.map((offer) => offer.hotelId) } },
          include: HOTEL_CATALOG_INCLUDE,
        })
      : [];
    const catalogById = new Map(catalog.map((hotel) => [hotel.id, hotel]));

    return {
      data: pageOffers.flatMap(({ hotelId, allocation }) => {
        const hotel = catalogById.get(hotelId);
        if (!hotel) return [];
        return [
          {
            hotel,
            stay_offer: {
              nights: stay.nights.length,
              currency: stay.currency,
              pricing_status: pricingStatus(allocation.total),
              total: formatAmountOrNull(allocation.total),
              rooms: allocation.rooms.map(toRoomQuantity),
            },
          },
        ];
      }),
      ...this.prismaService.formatPaginationResponse({
        page,
        count: offers.length,
        limit: take,
      }),
    };
  }

  async quote(
    hotelId: string,
    body: StayQuoteBody,
  ): Promise<StayQuoteResponse> {
    const hotel = UUID_PATTERN.test(hotelId)
      ? await this.prismaService.hotels.findFirst({
          where: { id: hotelId, is_deleted: false },
          select: {
            id: true,
            rooms: { where: ELIGIBLE_ROOM_WHERE, select: STOCK_ROOM_SELECT },
            addons: {
              where: { is_deleted: false },
              select: { id: true, price: true, price_egp: true },
            },
          },
        })
      : null;
    if (!hotel) throw notFound('الفندق غير موجود');

    const stay = toStay(body);
    const roomNights = await loadRoomNights(
      this.prismaService,
      hotel.rooms.map((room) => room.id),
      body.check_in,
      body.check_out,
      { openOnly: true },
    );
    const terms = availableTerms(hotel.rooms, roomNights, stay);
    const rooms = body.rooms
      ? exactRooms(body.rooms, terms, stay.guests)
      : recommendedRooms(terms, stay.guests);
    const priced = priceStay(
      rooms,
      terms,
      selectedUpgrades(body.addons ?? [], hotel.addons, stay.currency),
      stay.nights.length,
    );

    return {
      hotel_id: hotel.id,
      check_in: body.check_in,
      check_out: body.check_out,
      adults: body.adults,
      children: body.children,
      nights: stay.nights.length,
      visitor_category: body.visitor_category,
      currency: stay.currency,
      pricing_status: pricingStatus(priced.total),
      available_room_types: terms.map((type) => ({
        room_id: type.roomId,
        capacity: type.capacity,
        max_quantity: type.maxQuantity,
        unit_stay_total: formatAmountOrNull(type.unitStayTotal),
      })),
      rooms: priced.rooms.map((line) => ({
        room_id: line.roomId,
        quantity: line.quantity,
        subtotal: formatAmountOrNull(line.subtotal),
        nightly_rates: line.nightlyRates.map((rate) => ({
          date: rate.date,
          unit_rate: formatAmountOrNull(rate.unitRate),
        })),
      })),
      addons: priced.addons.map((line) => ({
        addon_id: line.addonId,
        quantity: line.quantity,
        unit_rate: formatAmountOrNull(line.unitRate),
        subtotal: formatAmountOrNull(line.subtotal),
      })),
      room_total: formatAmountOrNull(priced.roomTotal),
      addons_total: formatAmountOrNull(priced.addonsTotal),
      total: formatAmountOrNull(priced.total),
      quoted_at: new Date().toISOString(),
    };
  }
}
