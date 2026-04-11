import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './modules/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { ConfigModule } from '@nestjs/config';
import { HotelModule } from './modules/hotel/hotel.module';
import { FileModule } from './modules/file/file.module';
import { OfferModule } from './modules/offer/offer.module';
import { RoomModule } from './modules/room/room.module';
import { AddonModule } from './modules/addon/addon.module';
import { TripModule } from './modules/trip/trip.module';
import { SecurityApprovalModule } from './modules/security-approval/security-approval.module';
import { PhotoGalleryModule } from './modules/photo-gallery/photo-gallery.module';
import { CommentModule } from './modules/comment/comment.module';
import { QuestionModule } from './modules/question/question.module';
import { TripAddonModule } from './modules/trip-addon/trip-addon.module';
import { TripOptionModule } from './modules/trip-option/trip-option.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    AuthModule,
    AdminModule,
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'short', ttl: 1000, limit: 5 },
        { name: 'medium', ttl: 60000, limit: 100 },
      ],
    }),
    HotelModule,
    FileModule,
    OfferModule,
    RoomModule,
    AddonModule,
    TripModule,
    SecurityApprovalModule,
    PhotoGalleryModule,
    CommentModule,
    QuestionModule,
    TripAddonModule,
    TripOptionModule,
  ],
  controllers: [],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
