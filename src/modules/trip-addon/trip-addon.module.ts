import { Module } from '@nestjs/common';
import { TripAddonService } from './trip-addon.service';
import { TripAddonController } from './trip-addon.controller';
import { DatabaseService } from '../database/database.service';

@Module({
  controllers: [TripAddonController],
  providers: [TripAddonService, DatabaseService],
})
export class TripAddonModule {}
