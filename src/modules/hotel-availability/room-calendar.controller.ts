import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Query,
  UseFilters,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'src/pipes/zod.validation.pipe';
import { RoomCalendarService } from './room-calendar.service';
import {
  GetRoomCalendarSwagger,
  UpdateRoomCalendarSwagger,
} from './swagger/availability.swagger';
import type {
  CalendarRangeQuery,
  CalendarUpdateBody,
} from './types/availability.dto';
import { AvailabilityExceptionFilter } from './util/availability-exception.filter';
import {
  calendarRangeQuerySchema,
  calendarUpdateBodySchema,
} from './util/availability.validation';

@ApiTags('Room calendar')
@ApiBearerAuth()
@UseFilters(AvailabilityExceptionFilter)
@Controller('hotel/:hotelId/rooms/:roomId/calendar')
export class RoomCalendarController {
  constructor(private readonly roomCalendarService: RoomCalendarService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @GetRoomCalendarSwagger()
  findRange(
    @Param('hotelId') hotelId: string,
    @Param('roomId') roomId: string,
    @Query(new ZodValidationPipe(calendarRangeQuerySchema))
    range: CalendarRangeQuery,
  ) {
    return this.roomCalendarService.getCalendar(hotelId, roomId, range);
  }

  @Patch()
  @UpdateRoomCalendarSwagger()
  update(
    @Param('hotelId') hotelId: string,
    @Param('roomId') roomId: string,
    @Body(new ZodValidationPipe(calendarUpdateBodySchema))
    body: CalendarUpdateBody,
  ) {
    return this.roomCalendarService.updateCalendar(hotelId, roomId, body);
  }
}
