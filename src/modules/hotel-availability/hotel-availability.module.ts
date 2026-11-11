import { Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RoomCalendarController } from './room-calendar.controller';
import { RoomCalendarService } from './room-calendar.service';

@Module({
  controllers: [RoomCalendarController],
  providers: [RoomCalendarService, DatabaseService],
})
export class HotelAvailabilityModule {}
