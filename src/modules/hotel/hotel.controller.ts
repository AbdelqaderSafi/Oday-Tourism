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
  UseFilters,
  Header,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AvailabilityExceptionFilter } from '../hotel-availability/util/availability-exception.filter';
import { HotelAvailabilityService } from '../hotel-availability/hotel-availability.service';
import {
  staySearchQuerySchema,
  stayQuoteBodySchema,
  stayCalendarQuerySchema,
} from '../hotel-availability/util/availability.validation';
import {
  SearchHotelStaysSwagger,
  StayQuoteSwagger,
  StayCalendarSwagger,
} from '../hotel-availability/swagger/availability.swagger';
import type {
  StayCalendarQuery,
  StayQuoteBody,
  StaySearchQuery,
} from '../hotel-availability/types/availability.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsPublic } from 'src/decorators/public.decorator';
import { HotelService } from './hotel.service';
import type {
  CreateHotelDto,
  HotelResponseDTO,
  UpdateHotelRequest,
} from './types/hotel.dto';
import { FileCleanupInterceptor } from '../file/cleanup-file.interceptor';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ZodValidationPipe } from 'src/pipes/zod.validation.pipe';
import {
  hotelPaginationSchema,
  hotelValidationSchema,
  updateHotelValidationSchema,
} from './util/hotel.validation';
import {
  CreateHotelSwagger,
  FindAllHotelsSwagger,
  FindOneHotelSwagger,
  UpdateHotelSwagger,
  DeleteHotelSwagger,
} from './swagger/hotel.swagger';
import type { HotelQuery } from './types/hotel.types';

@ApiTags('Hotels')
@ApiBearerAuth()
@Controller('hotel')
export class HotelController {
  constructor(
    private readonly hotelService: HotelService,
    private readonly hotelAvailabilityService: HotelAvailabilityService,
  ) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'mainImages', maxCount: 5 },
      { name: 'subImages', maxCount: 10 },
    ]),
    FileCleanupInterceptor,
  )
  @CreateHotelSwagger()
  create(
    @Body(new ZodValidationPipe(hotelValidationSchema))
    createHotelDto: CreateHotelDto,
    @UploadedFiles()
    files: {
      mainImages?: Express.Multer.File[];
      subImages?: Express.Multer.File[];
    },
  ): Promise<HotelResponseDTO> {
    return this.hotelService.create(createHotelDto, files);
  }

  @IsPublic(true)
  @Get()
  @FindAllHotelsSwagger()
  findAll(
    @Query(new ZodValidationPipe(hotelPaginationSchema)) query: HotelQuery,
  ) {
    return this.hotelService.findAll(query);
  }

  @IsPublic(true)
  @Get('search')
  @Header('Cache-Control', 'no-store')
  @UseFilters(AvailabilityExceptionFilter)
  @SearchHotelStaysSwagger()
  search(
    @Query(new ZodValidationPipe(staySearchQuerySchema)) query: StaySearchQuery,
  ) {
    return this.hotelAvailabilityService.search(query);
  }

  @IsPublic(true)
  @Get(':id')
  @FindOneHotelSwagger()
  findOne(@Param('id') id: string) {
    return this.hotelService.findOne(id);
  }

  @IsPublic(true)
  @Post(':hotelId/stay-quote')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @UseFilters(AvailabilityExceptionFilter)
  @StayQuoteSwagger()
  quote(
    @Param('hotelId') hotelId: string,
    @Body(new ZodValidationPipe(stayQuoteBodySchema)) body: StayQuoteBody,
  ) {
    return this.hotelAvailabilityService.quote(hotelId, body);
  }

  @IsPublic(true)
  @Get(':hotelId/stay-calendar')
  @Header('Cache-Control', 'no-store')
  @UseFilters(AvailabilityExceptionFilter)
  @StayCalendarSwagger()
  stayCalendar(
    @Param('hotelId') hotelId: string,
    @Query(new ZodValidationPipe(stayCalendarQuerySchema))
    query: StayCalendarQuery,
  ) {
    return this.hotelAvailabilityService.stayCalendar(hotelId, query);
  }

  @Patch(':id')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'mainImages', maxCount: 5 },
      { name: 'subImages', maxCount: 10 },
    ]),
    FileCleanupInterceptor,
  )
  @UseFilters(AvailabilityExceptionFilter)
  @UpdateHotelSwagger()
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateHotelValidationSchema))
    updatePayload: UpdateHotelRequest,
    @UploadedFiles()
    files?: {
      mainImages?: Express.Multer.File[];
      subImages?: Express.Multer.File[];
    },
  ): Promise<HotelResponseDTO> {
    return this.hotelService.update(id, updatePayload, files);
  }

  @Delete(':id')
  @DeleteHotelSwagger()
  remove(@Param('id') id: string) {
    return this.hotelService.remove(id);
  }
}
