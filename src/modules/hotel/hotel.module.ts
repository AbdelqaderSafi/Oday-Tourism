import { Module } from '@nestjs/common';
import { HotelService } from './hotel.service';
import { HotelController } from './hotel.controller';
import { DatabaseService } from '../database/database.service';
import { FileModule } from '../file/file.module';
import { HotelAvailabilityModule } from '../hotel-availability/hotel-availability.module';

@Module({
  controllers: [HotelController],
  providers: [HotelService, DatabaseService],
  imports: [FileModule, HotelAvailabilityModule],
})
export class HotelModule {}
