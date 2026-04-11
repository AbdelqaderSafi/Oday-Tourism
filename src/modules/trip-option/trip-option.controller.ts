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
import { TripOptionService } from './trip-option.service';
import type { CreateTripOptionDto, UpdateTripOptionDto } from './types/trip-option.dto';
import { ZodValidationPipe } from 'src/pipes/zod.validation.pipe';
import {
  createTripOptionValidationSchema,
  updateTripOptionValidationSchema,
} from './util/trip-option.validation';
import {
  CreateTripOptionSwagger,
  DeleteTripOptionSwagger,
  FindAllTripOptionsSwagger,
  FindOneTripOptionSwagger,
  UpdateTripOptionSwagger,
} from './swagger/trip-option.swagger';

@ApiTags('Trip Options')
@ApiBearerAuth()
@Controller('trip/:tripId/option')
export class TripOptionController {
  constructor(private readonly tripOptionService: TripOptionService) {}

  @Post()
  @CreateTripOptionSwagger()
  create(
    @Param('tripId') tripId: string,
    @Body(new ZodValidationPipe(createTripOptionValidationSchema))
    dto: CreateTripOptionDto,
  ) {
    return this.tripOptionService.create(tripId, dto);
  }

  @Get()
  @FindAllTripOptionsSwagger()
  findAll(@Param('tripId') tripId: string) {
    return this.tripOptionService.findAll(tripId);
  }

  @Get(':id')
  @FindOneTripOptionSwagger()
  findOne(@Param('tripId') tripId: string, @Param('id') id: string) {
    return this.tripOptionService.findOne(tripId, id);
  }

  @Patch(':id')
  @UpdateTripOptionSwagger()
  update(
    @Param('tripId') tripId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTripOptionValidationSchema))
    dto: UpdateTripOptionDto,
  ) {
    return this.tripOptionService.update(tripId, id, dto);
  }

  @Delete(':id')
  @DeleteTripOptionSwagger()
  remove(@Param('tripId') tripId: string, @Param('id') id: string) {
    return this.tripOptionService.remove(tripId, id);
  }
}
