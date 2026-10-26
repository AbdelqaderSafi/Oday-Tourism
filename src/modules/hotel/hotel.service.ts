import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateHotelDto, UpdateHotelRequest } from './types/hotel.dto';
import { Prisma } from 'generated/prisma/client';
import { DatabaseService } from '../database/database.service';
import { FileService } from '../file/file.service';
import { HotelQuery } from './types/hotel.types';
import { removeFields } from '../utils/object.util';
import { getDiscountPriceIssues, throwPriceIssues } from '../utils/price.util';

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
          const roomId = randomUUID();
          const { translations: roomTranslations, price, ...roomRest } = room;
          await tx.room.create({
            data: {
              id: roomId,
              hotel_id: hotelId,
              price: price as Prisma.Decimal,
              ...roomRest,
            },
          });
          for (const t of roomTranslations) {
            await tx.roomTranslation.create({
              data: { room_id: roomId, ...t },
            });
          }
        }
      }

      if (addons?.length) {
        for (const addon of addons) {
          const addonId = randomUUID();
          const { translations: addonTranslations, price, price_egp } = addon;
          await tx.hotelAddon.create({
            data: {
              id: addonId,
              hotel_id: hotelId,
              price,
              price_egp,
            },
          });
          for (const t of addonTranslations) {
            await tx.hotelAddonTranslation.create({
              data: { addon_id: addonId, ...t },
            });
          }
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
        include: {
          assets: true,
          translations: true,
          rooms: {
            where: { is_deleted: false },
            include: { translations: true },
          },
          addons: {
            where: { is_deleted: false },
            include: { translations: true },
          },
        },
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
        include: {
          assets: true,
          translations: true,
          rooms: {
            where: { is_deleted: false },
            include: { translations: true },
          },
          addons: {
            where: { is_deleted: false },
            include: { translations: true },
          },
        },
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
      include: {
        assets: true,
        translations: true,
        rooms: {
          where: { is_deleted: false },
          include: { translations: true },
        },
        addons: {
          where: { is_deleted: false },
          include: { translations: true },
        },
      },
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

    const { deleteAssetIds, translations, rooms, addons, ...rest } =
      updateHotelDto;

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

      if (rooms !== undefined) {
        const existingRooms = await tx.room.findMany({
          where: { hotel_id: id },
          select: { id: true },
        });
        if (existingRooms.length) {
          await tx.roomTranslation.deleteMany({
            where: { room_id: { in: existingRooms.map((r) => r.id) } },
          });
          await tx.room.deleteMany({ where: { hotel_id: id } });
        }
        for (const room of rooms) {
          const roomId = randomUUID();
          const { translations: roomTranslations, price, ...roomRest } = room;
          await tx.room.create({
            data: {
              id: roomId,
              hotel_id: id,
              price: price as Prisma.Decimal,
              ...roomRest,
            },
          });
          for (const t of roomTranslations) {
            await tx.roomTranslation.create({
              data: { room_id: roomId, ...t },
            });
          }
        }
      }

      if (addons !== undefined) {
        const existingAddons = await tx.hotelAddon.findMany({
          where: { hotel_id: id },
          select: { id: true },
        });
        if (existingAddons.length) {
          await tx.hotelAddonTranslation.deleteMany({
            where: { addon_id: { in: existingAddons.map((a) => a.id) } },
          });
          await tx.hotelAddon.deleteMany({ where: { hotel_id: id } });
        }
        for (const addon of addons) {
          const addonId = randomUUID();
          const { translations: addonTranslations, price, price_egp } = addon;
          await tx.hotelAddon.create({
            data: { id: addonId, hotel_id: id, price, price_egp },
          });
          for (const t of addonTranslations) {
            await tx.hotelAddonTranslation.create({
              data: { addon_id: addonId, ...t },
            });
          }
        }
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
      include: {
        assets: true,
        translations: true,
        rooms: {
          where: { is_deleted: false },
          include: { translations: true },
        },
        addons: {
          where: { is_deleted: false },
          include: { translations: true },
        },
      },
    });
  }

  remove(id: string) {
    return this.prismaService.hotels.update({
      where: { id },
      data: { is_deleted: true },
    });
  }
}
