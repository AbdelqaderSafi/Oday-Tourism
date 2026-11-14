import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  AddonInput,
  AddonUpdateInput,
  CreateHotelDto,
  RoomInput,
  RoomUpdateInput,
  UpdateHotelRequest,
} from './types/hotel.dto';
import { Prisma } from 'generated/prisma/client';
import { DatabaseService } from '../database/database.service';
import { FileService } from '../file/file.service';
import { HotelQuery } from './types/hotel.types';
import { removeFields } from '../utils/object.util';
import { getDiscountPriceIssues, throwPriceIssues } from '../utils/price.util';
import { HOTEL_CATALOG_INCLUDE } from './util/hotel-catalog';
import {
  addonIdsRequired,
  invalidInput,
  roomIdsRequired,
} from '../hotel-availability/util/availability.errors';

type CatalogWriteRequest = Pick<
  UpdateHotelRequest,
  | 'rooms'
  | 'rooms_write_mode'
  | 'delete_room_ids'
  | 'addons'
  | 'addons_write_mode'
  | 'delete_addon_ids'
>;

const isExistingRoom = (
  row: RoomInput | RoomUpdateInput,
): row is RoomUpdateInput => 'id' in row;

const isExistingAddon = (
  row: AddonInput | AddonUpdateInput,
): row is AddonUpdateInput => 'id' in row;

@Injectable()
export class HotelService {
  constructor(
    private readonly prismaService: DatabaseService,
    private readonly filesService: FileService,
  ) {}

  async create(
    createHotelDto: CreateHotelDto,
    files: {
      mainImages?: Express.Multer.File[];
      subImages?: Express.Multer.File[];
    },
  ) {
    if (!files?.mainImages || files.mainImages.length === 0) {
      throw new BadRequestException(
        'يجب إرفاق صورة رئيسية واحدة على الأقل للفندق',
      );
    }

    const hotelId = randomUUID();
    const { translations, rooms, addons, slug, ...rest } = createHotelDto;

    return this.prismaService.$transaction(async (tx) => {
      await tx.hotels.create({
        data: {
          id: hotelId,
          slug,
          ...rest,
        },
      });

      for (const translation of translations) {
        const { Facilities, ...translationRest } = translation;
        await tx.hotelTranslation.create({
          data: {
            hotel_id: hotelId,
            ...translationRest,
            Facilities: Facilities as Prisma.InputJsonValue,
          },
        });
      }

      if (rooms?.length) {
        for (const room of rooms) {
          await this.createRoom(tx, hotelId, room);
        }
      }

      if (addons?.length) {
        for (const addon of addons) {
          await this.createAddon(tx, hotelId, addon);
        }
      }

      const now = new Date();
      const allAssets = [
        ...(files.mainImages || []).map((file) => ({
          ...file,
          kind: 'HOTEL_MAIN_IMAGE',
        })),
        ...(files.subImages || []).map((file) => ({
          ...file,
          kind: 'HOTEL_GALLERY_IMAGE',
        })),
      ];

      for (const file of allAssets) {
        await tx.$executeRaw`
          INSERT INTO assets
            (id, storage_provider_name, file_id, url, file_type, file_size_in_kb, kind, hotel_id, created_at, updated_at)
          VALUES
            (${randomUUID()}, 'IMAGE_KIT', ${file['fileId']!}, ${file['url']!}, ${file.mimetype}, ${Math.floor(file.size / 1024)}, ${file.kind}, ${hotelId}, ${now}, ${now})
        `;
      }

      return tx.hotels.findUniqueOrThrow({
        where: { id: hotelId },
        include: HOTEL_CATALOG_INCLUDE,
      });
    });
  }

  findAll(query: HotelQuery) {
    return this.prismaService.$transaction(async (prisma) => {
      const whereClause: Prisma.hotelsWhereInput = {
        ...(query.destination && { destination: query.destination }),
        ...(query.rating && { rating: query.rating }),
        is_deleted: false,
      };

      const pagination = this.prismaService.handleQueryPagination(query);
      const hotels = await prisma.hotels.findMany({
        ...removeFields(pagination, ['page']),
        where: whereClause,
        include: HOTEL_CATALOG_INCLUDE,
      });

      const count = await prisma.hotels.count({
        where: whereClause,
      });

      return {
        data: hotels,
        ...this.prismaService.formatPaginationResponse({
          page: pagination.page,
          count,
          limit: pagination.take,
        }),
      };
    });
  }

  findOne(id: string) {
    return this.prismaService.hotels.findUnique({
      where: { id },
      include: HOTEL_CATALOG_INCLUDE,
    });
  }

  async update(
    id: string,
    updateHotelDto: UpdateHotelRequest,
    files?: {
      mainImages?: Express.Multer.File[];
      subImages?: Express.Multer.File[];
    },
  ) {
    const hotel = await this.prismaService.hotels.findUnique({
      where: { id },
      include: { assets: true, translations: true },
    });
    if (!hotel) throw new NotFoundException('الفندق غير موجود');

    const {
      deleteAssetIds,
      translations,
      rooms,
      rooms_write_mode,
      delete_room_ids,
      addons,
      addons_write_mode,
      delete_addon_ids,
      ...rest
    } = updateHotelDto;

    const discountFields = [
      'is_discounted',
      'initial_price',
      'initial_price_egp',
      'original_price',
      'original_price_egp',
    ] as const;
    if (discountFields.some((field) => rest[field] !== undefined)) {
      const merged = { ...hotel };
      for (const field of discountFields) {
        if (rest[field] !== undefined)
          Object.assign(merged, { [field]: rest[field] });
      }
      throwPriceIssues(getDiscountPriceIssues(merged));
    }

    const fileIdsToDelete = hotel.assets
      .filter((a) => deleteAssetIds?.includes(a.id))
      .map((a) => a.fileId);

    await this.prismaService.$transaction(async (tx) => {
      const catalogWrite = {
        rooms,
        rooms_write_mode,
        delete_room_ids,
        addons,
        addons_write_mode,
        delete_addon_ids,
      };
      if (
        [rooms, delete_room_ids, addons, delete_addon_ids].some(
          (field) => field !== undefined,
        )
      ) {
        await this.lockCatalogChanges(tx, id, catalogWrite);
      }

      if (deleteAssetIds?.length) {
        await tx.$executeRaw`
          DELETE FROM assets WHERE hotel_id = ${id}
          AND id IN (${Prisma.join(deleteAssetIds)})
        `;
      }

      await tx.hotels.update({
        where: { id },
        data: rest,
      });

      if (translations?.length) {
        for (const translation of translations) {
          const { Facilities, ...translationRest } = translation;
          const existing = await tx.hotelTranslation.findUnique({
            where: {
              hotel_id_language: {
                hotel_id: id,
                language: translation.language,
              },
            },
          });
          if (existing) {
            await tx.hotelTranslation.update({
              where: {
                hotel_id_language: {
                  hotel_id: id,
                  language: translation.language,
                },
              },
              data: {
                ...translationRest,
                Facilities: Facilities as Prisma.InputJsonValue,
              },
            });
          } else {
            await tx.hotelTranslation.create({
              data: {
                hotel_id: id,
                ...translationRest,
                Facilities: Facilities as Prisma.InputJsonValue,
              },
            });
          }
        }
      }

      if (rooms_write_mode === 'by_id') {
        await this.writeRoomsById(tx, id, rooms ?? [], delete_room_ids ?? []);
      } else if (rooms !== undefined) {
        await this.replaceRooms(
          tx,
          id,
          rooms.filter((row): row is RoomInput => !isExistingRoom(row)),
        );
      }

      if (addons_write_mode === 'by_id') {
        await this.writeAddonsById(
          tx,
          id,
          addons ?? [],
          delete_addon_ids ?? [],
        );
      } else if (addons !== undefined) {
        await this.replaceAddons(
          tx,
          id,
          addons.filter((row): row is AddonInput => !isExistingAddon(row)),
        );
      }

      if (files?.mainImages?.length || files?.subImages?.length) {
        const now = new Date();
        const allAssets = [
          ...(files.mainImages || []).map((file) => ({
            ...file,
            kind: 'HOTEL_MAIN_IMAGE',
          })),
          ...(files.subImages || []).map((file) => ({
            ...file,
            kind: 'HOTEL_GALLERY_IMAGE',
          })),
        ];
        for (const file of allAssets) {
          await tx.$executeRaw`
            INSERT INTO assets
              (id, storage_provider_name, file_id, url, file_type, file_size_in_kb, kind, hotel_id, created_at, updated_at)
            VALUES
              (${randomUUID()}, 'IMAGE_KIT', ${file['fileId']!}, ${file['url']!}, ${file.mimetype}, ${Math.floor(file.size / 1024)}, ${file.kind}, ${id}, ${now}, ${now})
          `;
        }
      }
    });

    await Promise.allSettled(
      fileIdsToDelete.map((fileId) =>
        this.filesService.deleteFileFromImageKit(fileId),
      ),
    );

    return this.prismaService.hotels.findUniqueOrThrow({
      where: { id },
      include: HOTEL_CATALOG_INCLUDE,
    });
  }

  remove(id: string) {
    return this.prismaService.hotels.update({
      where: { id },
      data: { is_deleted: true },
    });
  }

  // Room and add-on writes lock the hotel row first; calendar writes do the same, so the two never deadlock.
  private async lockCatalogChanges(
    tx: Prisma.TransactionClient,
    hotelId: string,
    request: CatalogWriteRequest,
  ) {
    const [hotel] = await tx.$queryRaw<{ calendar_managed_at: Date | null }[]>`
      SELECT calendar_managed_at FROM hotels WHERE id = ${hotelId} FOR UPDATE
    `;
    const managed = Boolean(hotel?.calendar_managed_at);
    if (request.rooms_write_mode === 'by_id') {
      const editedIds = (request.rooms ?? [])
        .filter(isExistingRoom)
        .map((row) => row.id);
      await this.assertActiveRooms(tx, hotelId, editedIds, 'rooms');
      await this.assertActiveRooms(
        tx,
        hotelId,
        request.delete_room_ids ?? [],
        'delete_room_ids',
      );
    } else if (request.rooms !== undefined && managed) {
      throw roomIdsRequired();
    }
    if (request.addons_write_mode === 'by_id') {
      const editedIds = (request.addons ?? [])
        .filter(isExistingAddon)
        .map((row) => row.id);
      await this.assertActiveAddons(tx, hotelId, editedIds, 'addons');
      await this.assertActiveAddons(
        tx,
        hotelId,
        request.delete_addon_ids ?? [],
        'delete_addon_ids',
      );
    } else if (request.addons !== undefined && managed) {
      throw addonIdsRequired();
    }
  }

  private async assertActiveAddons(
    tx: Prisma.TransactionClient,
    hotelId: string,
    addonIds: string[],
    field: string,
  ) {
    if (!addonIds.length) return;
    const found = await tx.hotelAddon.count({
      where: { id: { in: addonIds }, hotel_id: hotelId, is_deleted: false },
    });
    if (found !== addonIds.length)
      throw invalidInput(field, 'معرّف ترقية غير صالح لهذا الفندق');
  }

  private async replaceAddons(
    tx: Prisma.TransactionClient,
    hotelId: string,
    addons: AddonInput[],
  ) {
    await tx.hotelAddon.updateMany({
      where: { hotel_id: hotelId, is_deleted: false },
      data: { is_deleted: true },
    });
    for (const addon of addons) await this.createAddon(tx, hotelId, addon);
  }

  private async writeAddonsById(
    tx: Prisma.TransactionClient,
    hotelId: string,
    rows: (AddonInput | AddonUpdateInput)[],
    deleteIds: string[],
  ) {
    for (const row of rows) {
      if (isExistingAddon(row)) await this.updateAddon(tx, row);
      else await this.createAddon(tx, hotelId, row);
    }
    if (deleteIds.length) {
      await tx.hotelAddon.updateMany({
        where: { id: { in: deleteIds }, hotel_id: hotelId },
        data: { is_deleted: true },
      });
    }
  }

  private async createAddon(
    tx: Prisma.TransactionClient,
    hotelId: string,
    addon: AddonInput,
  ) {
    const addonId = randomUUID();
    const { translations, price, price_egp } = addon;
    await tx.hotelAddon.create({
      data: { id: addonId, hotel_id: hotelId, price, price_egp },
    });
    for (const translation of translations) {
      await tx.hotelAddonTranslation.create({
        data: { addon_id: addonId, ...translation },
      });
    }
  }

  private async updateAddon(
    tx: Prisma.TransactionClient,
    { id, translations, ...fields }: AddonUpdateInput,
  ) {
    await tx.hotelAddon.update({ where: { id }, data: fields });
    for (const translation of translations ?? []) {
      await tx.hotelAddonTranslation.upsert({
        where: {
          addon_id_language: { addon_id: id, language: translation.language },
        },
        update: {
          name: translation.name,
          description: translation.description,
        },
        create: { addon_id: id, ...translation },
      });
    }
  }

  private async assertActiveRooms(
    tx: Prisma.TransactionClient,
    hotelId: string,
    roomIds: string[],
    field: string,
  ) {
    if (!roomIds.length) return;
    const found = await tx.room.count({
      where: { id: { in: roomIds }, hotel_id: hotelId, is_deleted: false },
    });
    if (found !== roomIds.length)
      throw invalidInput(field, 'معرّف غرفة غير صالح لهذا الفندق');
  }

  private async replaceRooms(
    tx: Prisma.TransactionClient,
    hotelId: string,
    rooms: RoomInput[],
  ) {
    await tx.room.updateMany({
      where: { hotel_id: hotelId, is_deleted: false },
      data: { is_deleted: true },
    });
    for (const room of rooms) await this.createRoom(tx, hotelId, room);
  }

  private async writeRoomsById(
    tx: Prisma.TransactionClient,
    hotelId: string,
    rows: (RoomInput | RoomUpdateInput)[],
    deleteIds: string[],
  ) {
    for (const row of rows) {
      if (isExistingRoom(row)) await this.updateRoom(tx, row);
      else await this.createRoom(tx, hotelId, row);
    }
    if (deleteIds.length) {
      await tx.room.updateMany({
        where: { id: { in: deleteIds }, hotel_id: hotelId },
        data: { is_deleted: true },
      });
    }
  }

  private async createRoom(
    tx: Prisma.TransactionClient,
    hotelId: string,
    room: RoomInput,
  ) {
    const roomId = randomUUID();
    const { translations, ...fields } = room;
    await tx.room.create({
      data: { id: roomId, hotel_id: hotelId, ...fields },
    });
    for (const translation of translations) {
      await tx.roomTranslation.create({
        data: { room_id: roomId, ...translation },
      });
    }
  }

  private async updateRoom(
    tx: Prisma.TransactionClient,
    { id, translations, ...fields }: RoomUpdateInput,
  ) {
    await tx.room.update({ where: { id }, data: fields });
    for (const translation of translations ?? []) {
      await tx.roomTranslation.upsert({
        where: {
          room_id_language: { room_id: id, language: translation.language },
        },
        update: {
          name: translation.name,
          description: translation.description,
        },
        create: { room_id: id, ...translation },
      });
    }
  }
}
