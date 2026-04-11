import { Module } from '@nestjs/common';
import { TripOptionService } from './trip-option.service';
import { TripOptionController } from './trip-option.controller';
import { DatabaseService } from '../database/database.service';

@Module({
  controllers: [TripOptionController],
  providers: [TripOptionService, DatabaseService],
})
export class TripOptionModule {}
