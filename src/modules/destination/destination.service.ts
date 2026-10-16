import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DestinatiosnEnum } from 'generated/prisma/client';
import { FileService } from '../file/file.service';
import { DatabaseService } from '../database/database.service';
import type {
  DestinationQuery,
  DestinationResponseDTO,
} from './types/destination.dto';

@Injectable()
export class DestinationService {
  constructor(
    private readonly prisma: DatabaseService,
    private readonly fileService: FileService,
  ) {}

  async findAll(query: DestinationQuery): Promise<DestinationResponseDTO[]> {
    const [records, hotelCounts, tripCounts] = await Promise.all([
      this.prisma.destinationImage.findMany({ include: { assets: true } }),
      this.prisma.hotels.groupBy({
        by: ['destination'],
        where: { is_deleted: false },
        _count: { _all: true },
      }),
      this.prisma.trips.groupBy({
        by: ['city'],
        where: { is_deleted: false },
        _count: { _all: true },
      }),
    ]);
    const images = new Map(records.map((r) => [r.destination, r.assets[0]]));
    const hotels = new Map(
      hotelCounts.map((h) => [h.destination, h._count._all]),
    );
    const trips = new Map(tripCounts.map((t) => [t.city, t._count._all]));

    return Object.values(DestinatiosnEnum)
      .map((destination) => ({
        destination,
        image: images.get(destination) ?? null,
        hotels_count: hotels.get(destination) ?? 0,
        trips_count: trips.get(destination) ?? 0,
      }))
      .filter((d) => {
        if (query.type === 'hotels') return d.hotels_count > 0;
        if (query.type === 'trips') return d.trips_count > 0;
        return true;
      });
  }

  async findOne(
    destination: DestinatiosnEnum,
  ): Promise<DestinationResponseDTO> {
    const [record, hotels_count, trips_count] = await Promise.all([
      this.prisma.destinationImage.findUnique({
        where: { destination },
        include: { assets: true },
      }),
      this.prisma.hotels.count({ where: { destination, is_deleted: false } }),
      this.prisma.trips.count({
        where: { city: destination, is_deleted: false },
      }),
    ]);
    return {
      destination,
      image: record?.assets[0] ?? null,
      hotels_count,
      trips_count,
    };
  }

  async setImage(
    destination: DestinatiosnEnum,
    file: Express.Multer.File,
  ): Promise<DestinationResponseDTO> {
    if (!file) {
      throw new BadRequestException('يجب إرفاق صورة للوجهة');
    }

    const oldAssets = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.destinationImage.findUnique({
        where: { destination },
        include: { assets: true },
      });

      const recordId = existing?.id ?? randomUUID();
      if (existing) {
        await tx.asset.deleteMany({ where: { destinationImageId: recordId } });
        await tx.destinationImage.update({
          where: { id: recordId },
          data: { updated_at: new Date() },
        });
      } else {
        await tx.destinationImage.create({
          data: { id: recordId, destination },
        });
      }

      const now = new Date();
      await tx.$executeRaw`
        INSERT INTO assets
          (id, storage_provider_name, file_id, url, file_type, file_size_in_kb, kind, destination_image_id, created_at, updated_at)
        VALUES
          (${randomUUID()}, 'IMAGE_KIT', ${file.fileId!}, ${file.url!}, ${file.mimetype}, ${Math.floor(file.size / 1024)}, 'DESTINATION_IMAGE', ${recordId}, ${now}, ${now})
      `;

      return existing?.assets ?? [];
    });

    for (const asset of oldAssets) {
      await this.fileService
        .deleteFileFromImageKit(asset.fileId)
        .catch(() => {});
    }

    return this.findOne(destination);
  }

  async removeImage(destination: DestinatiosnEnum) {
    const record = await this.prisma.destinationImage.findUnique({
      where: { destination },
      include: { assets: true },
    });
    if (!record) throw new NotFoundException('لا توجد صورة لهذه الوجهة');

    await this.prisma.$transaction([
      this.prisma.asset.deleteMany({
        where: { destinationImageId: record.id },
      }),
      this.prisma.destinationImage.delete({ where: { id: record.id } }),
    ]);

    for (const asset of record.assets) {
      await this.fileService
        .deleteFileFromImageKit(asset.fileId)
        .catch(() => {});
    }

    return this.findOne(destination);
  }
}
