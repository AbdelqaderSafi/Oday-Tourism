import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TripAddonService } from './trip-addon.service';
import type { CreateTripAddonDto, UpdateTripAddonDto } from './types/trip-addon.dto';
import { ZodValidationPipe } from 'src/pipes/zod.validation.pipe';
import {
  createTripAddonValidationSchema,
  updateTripAddonValidationSchema,
} from './util/trip-addon.validation';
import {
  CreateTripAddonSwagger,
  DeleteTripAddonSwagger,
  FindAllTripAddonsSwagger,
  FindOneTripAddonSwagger,
  UpdateTripAddonSwagger,
} from './swagger/trip-addon.swagger';

@ApiTags('Trip Addons')
@ApiBearerAuth()
@Controller('trip/:tripId/addon')
export class TripAddonController {
  constructor(private readonly tripAddonService: TripAddonService) {}

  @Post()
  @CreateTripAddonSwagger()
  create(
    @Param('tripId') tripId: string,
    @Body(new ZodValidationPipe(createTripAddonValidationSchema))
    dto: CreateTripAddonDto,
  ) {
    return this.tripAddonService.create(tripId, dto);
  }

  @Get()
  @FindAllTripAddonsSwagger()
  findAll(@Param('tripId') tripId: string) {
    return this.tripAddonService.findAll(tripId);
  }

  @Get(':id')
  @FindOneTripAddonSwagger()
  findOne(@Param('tripId') tripId: string, @Param('id') id: string) {
    return this.tripAddonService.findOne(tripId, id);
  }

  @Patch(':id')
  @UpdateTripAddonSwagger()
  update(
    @Param('tripId') tripId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTripAddonValidationSchema))
    dto: UpdateTripAddonDto,
  ) {
    return this.tripAddonService.update(tripId, id, dto);
  }

  @Delete(':id')
  @DeleteTripAddonSwagger()
  remove(@Param('tripId') tripId: string, @Param('id') id: string) {
    return this.tripAddonService.remove(tripId, id);
  }
}
