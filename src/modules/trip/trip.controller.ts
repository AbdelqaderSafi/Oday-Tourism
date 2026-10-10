import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseInterceptors,
  UploadedFiles,
  Query,
  Patch,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsPublic } from 'src/decorators/public.decorator';
import { TripService } from './trip.service';
import type {
  CreateTripDto,
  TripResponseDTO,
  UpdateTripRequest,
} from './types/trip.dto';
import { FileCleanupInterceptor } from '../file/cleanup-file.interceptor';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ZodValidationPipe } from 'src/pipes/zod.validation.pipe';
import {
  tripPaginationSchema,
  tripValidationSchema,
  updateTripValidationSchema,
} from './util/trip.validation';
import {
  CreateTripSwagger,
  FindAllTripsSwagger,
  FindOneTripSwagger,
  UpdateTripSwagger,
  DeleteTripSwagger,
} from './swagger/trip.swagger';
import type { TripQuery } from './types/trip.types';

@ApiTags('Trips')
@ApiBearerAuth()
@Controller('trip')
export class TripController {
  constructor(private readonly tripService: TripService) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'mainImages', maxCount: 1 },
      { name: 'subImages', maxCount: 10 },
    ]),
    FileCleanupInterceptor,
  )
  @CreateTripSwagger()
  create(
    @Body(new ZodValidationPipe(tripValidationSchema))
    createTripDto: CreateTripDto,
    @UploadedFiles()
    files: {
      mainImages?: Express.Multer.File[];
      subImages?: Express.Multer.File[];
    },
  ): Promise<TripResponseDTO> {
    return this.tripService.create(createTripDto, files);
  }

  @IsPublic(true)
  @Get()
  @FindAllTripsSwagger()
  findAll(
    @Query(new ZodValidationPipe(tripPaginationSchema)) query: TripQuery,
  ) {
    return this.tripService.findAll(query);
  }

  @IsPublic(true)
  @Get(':id')
  @FindOneTripSwagger()
  findOne(@Param('id') id: string) {
    return this.tripService.findOne(id);
  }

  @Patch(':id')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'mainImages', maxCount: 1 },
      { name: 'subImages', maxCount: 10 },
    ]),
    FileCleanupInterceptor,
  )
  @UpdateTripSwagger()
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTripValidationSchema))
    updatePayload: UpdateTripRequest,
    @UploadedFiles()
    files?: {
      mainImages?: Express.Multer.File[];
      subImages?: Express.Multer.File[];
    },
  ): Promise<TripResponseDTO> {
    return this.tripService.update(id, updatePayload, files);
  }

  @Delete(':id')
  @DeleteTripSwagger()
  remove(@Param('id') id: string) {
    return this.tripService.remove(id);
  }
}
