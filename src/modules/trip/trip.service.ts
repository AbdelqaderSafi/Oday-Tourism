import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateTripDto, UpdateTripRequest } from './types/trip.dto';
import { Prisma } from 'generated/prisma/client';
import { DatabaseService } from '../database/database.service';
import { FileService } from '../file/file.service';
import { TripQuery } from './types/trip.types';
import { removeFields } from '../utils/object.util';

@Injectable()
export class TripService {
  constructor(
    private readonly prismaService: DatabaseService,
    private readonly filesService: FileService,
  ) {}

  async create(
    createTripDto: CreateTripDto,
    files: {
      mainImages?: Express.Multer.File[];
      subImages?: Express.Multer.File[];
    },
  ) {
    if (!files?.mainImages || files.mainImages.length === 0) {
      throw new BadRequestException('يجب إرفاق صورة رئيسية واحدة للرحلة');
    }

    const tripId = randomUUID();
    const { translations, options, addons, slug, youtube_video_url, ...rest } =
      createTripDto;

    return this.prismaService.$transaction(async (tx) => {
      await tx.trips.create({
        data: {
          id: tripId,
          slug,
          ...rest,
          ...(youtube_video_url !== undefined && {
            youtube_video_url:
              youtube_video_url === '' ? null : youtube_video_url,
          }),
        },
      });

      for (const translation of translations) {
        const { facilities, duration, ...translationRest } = translation;
        await tx.tripTranslation.create({
          data: {
            trip_id: tripId,
            ...translationRest,
            duration,
            facilities: facilities as Prisma.InputJsonValue,
          },
        });
      }

      if (options?.length) {
        for (const option of options) {
          const optionId = randomUUID();
          const { translations: optionTranslations, price } = option;
          await tx.tripOption.create({
            data: {
              id: optionId,
              trip_id: tripId,
              price: price as Prisma.Decimal,
            },
          });
          for (const t of optionTranslations) {
            await tx.optionTranslation.create({
              data: { option_id: optionId, ...t },
            });
          }
        }
      }

      if (addons?.length) {
        for (const addon of addons) {
          const addonId = randomUUID();
          const { translations: addonTranslations, price } = addon;
          await tx.tripAddon.create({
            data: {
              id: addonId,
              trip_id: tripId,
              price: price as Prisma.Decimal,
            },
          });
          for (const t of addonTranslations) {
            await tx.tripAddonTranslation.create({
              data: { addon_id: addonId, ...t },
            });
          }
        }
      }

      const now = new Date();
      const allAssets = [
        ...(files.mainImages || []).map((file) => ({
          ...file,
          kind: 'TRIP_MAIN_IMAGE',
        })),
        ...(files.subImages || []).map((file) => ({
          ...file,
          kind: 'TRIP_GALLERY_IMAGE',
        })),
      ];

      for (const file of allAssets) {
        await tx.$executeRaw`
          INSERT INTO assets
            (id, storage_provider_name, file_id, url, file_type, file_size_in_kb, kind, trip_id, created_at, updated_at)
          VALUES
            (${randomUUID()}, 'IMAGE_KIT', ${file['fileId']!}, ${file['url']!}, ${file.mimetype}, ${Math.floor(file.size / 1024)}, ${file.kind}, ${tripId}, ${now}, ${now})
        `;
      }

      return tx.trips.findUniqueOrThrow({
        where: { id: tripId },
        include: {
          assets: true,
          translations: true,
          options: { include: { translations: true } },
          addons: { include: { translations: true } },
        },
      });
    });
  }

  findAll(query: TripQuery) {
    return this.prismaService.$transaction(async (prisma) => {
      const whereClause: Prisma.tripsWhereInput = {
        is_deleted: false,
        ...(query.city && { city: query.city }),
      };

      const pagination = this.prismaService.handleQueryPagination(query);
      const trips = await prisma.trips.findMany({
        ...removeFields(pagination, ['page']),
        where: whereClause,
        include: {
          assets: true,
          translations: true,
          options: { include: { translations: true } },
          addons: { include: { translations: true } },
        },
      });

      const count = await prisma.trips.count({
        where: whereClause,
      });

      return {
        data: trips,
        ...this.prismaService.formatPaginationResponse({
          page: pagination.page,
          count,
          limit: pagination.take,
        }),
      };
    });
  }

  findOne(id: string) {
    return this.prismaService.trips.findUnique({
      where: { id },
      include: {
        assets: true,
        translations: true,
        options: { include: { translations: true } },
        addons: { include: { translations: true } },
      },
    });
  }

  async update(
    id: string,
    updateTripDto: UpdateTripRequest,
    files?: {
      mainImages?: Express.Multer.File[];
      subImages?: Express.Multer.File[];
    },
  ) {
    const trip = await this.prismaService.trips.findUnique({
      where: { id },
      include: { assets: true, translations: true },
    });
    if (!trip) throw new NotFoundException('الرحلة غير موجودة');

    const {
      deleteAssetIds,
      translations,
      options,
      addons,
      youtube_video_url,
      ...rest
    } = updateTripDto;

    const fileIdsToDelete = trip.assets
      .filter((a) => deleteAssetIds?.includes(a.id))
      .map((a) => a.fileId);

    // Validate that at least one main image will remain after update
    const currentMainImages = trip.assets.filter(
      (a) => a.kind === 'TRIP_MAIN_IMAGE',
    );
    const mainImagesToDelete = currentMainImages.filter((a) =>
      deleteAssetIds?.includes(a.id),
    );
    const remainingMainImages =
      currentMainImages.length - mainImagesToDelete.length;
    const newMainImages = files?.mainImages?.length || 0;

    if (remainingMainImages + newMainImages === 0) {
      throw new BadRequestException(
        'يجب أن تحتوي الرحلة على صورة رئيسية واحدة على الأقل',
      );
    }

    await this.prismaService.$transaction(async (tx) => {
      if (deleteAssetIds?.length) {
        await tx.$executeRaw`
          DELETE FROM assets WHERE trip_id = ${id}
          AND id IN (${Prisma.join(deleteAssetIds)})
        `;
      }

      await tx.trips.update({
        where: { id },
        data: {
          ...rest,
          ...(youtube_video_url !== undefined && {
            youtube_video_url:
              youtube_video_url === '' ? null : youtube_video_url,
          }),
        },
      });

      if (translations?.length) {
        for (const translation of translations) {
          const { facilities, duration, ...translationRest } = translation;
          await tx.tripTranslation.upsert({
            where: {
              trip_id_language: {
                trip_id: id,
                language: translation.language,
              },
            },
            update: {
              ...translationRest,
              duration,
              facilities: facilities as Prisma.InputJsonValue,
            },
            create: {
              trip_id: id,
              ...translationRest,
              duration,
              facilities: facilities as Prisma.InputJsonValue,
            },
          });
        }
      }

      if (options?.length) {
        for (const option of options) {
          const optionId = randomUUID();
          const { translations: optionTranslations, price } = option;
          await tx.tripOption.create({
            data: {
              id: optionId,
              trip_id: id,
              price: price as Prisma.Decimal,
            },
          });
          for (const t of optionTranslations) {
            await tx.optionTranslation.create({
              data: { option_id: optionId, ...t },
            });
          }
        }
      }

      if (addons?.length) {
        for (const addon of addons) {
          const addonId = randomUUID();
          const { translations: addonTranslations, price } = addon;
          await tx.tripAddon.create({
            data: { id: addonId, trip_id: id, price: price as Prisma.Decimal },
          });
          for (const t of addonTranslations) {
            await tx.tripAddonTranslation.create({
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
            kind: 'TRIP_MAIN_IMAGE',
          })),
          ...(files.subImages || []).map((file) => ({
            ...file,
            kind: 'TRIP_GALLERY_IMAGE',
          })),
        ];
        for (const file of allAssets) {
          await tx.$executeRaw`
            INSERT INTO assets
              (id, storage_provider_name, file_id, url, file_type, file_size_in_kb, kind, trip_id, created_at, updated_at)
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

    return this.prismaService.trips.findUniqueOrThrow({
      where: { id },
      include: {
        assets: true,
        translations: true,
        options: { include: { translations: true } },
        addons: { include: { translations: true } },
      },
    });
  }

  remove(id: string) {
    return this.prismaService.trips.update({
      where: { id },
      data: { is_deleted: true },
    });
  }
}
