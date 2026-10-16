import {
  Controller,
  Get,
  Put,
  Param,
  Query,
  Delete,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { DestinatiosnEnum } from 'generated/prisma/client';
import { IsPublic } from 'src/decorators/public.decorator';
import { ZodValidationPipe } from 'src/pipes/zod.validation.pipe';
import { FileCleanupInterceptor } from '../file/cleanup-file.interceptor';
import { DestinationService } from './destination.service';
import {
  destinationParamSchema,
  destinationQuerySchema,
} from './util/destination.validation';
import type {
  DestinationQuery,
  DestinationResponseDTO,
} from './types/destination.dto';
import {
  FindAllDestinationsSwagger,
  FindOneDestinationSwagger,
  SetDestinationImageSwagger,
  RemoveDestinationImageSwagger,
} from './swagger/destination.swagger';

@ApiTags('الوجهات')
@ApiBearerAuth()
@Controller('destination')
export class DestinationController {
  constructor(private readonly destinationService: DestinationService) {}

  @IsPublic(true)
  @Get()
  @FindAllDestinationsSwagger()
  findAll(
    @Query(new ZodValidationPipe(destinationQuerySchema))
    query: DestinationQuery,
  ): Promise<DestinationResponseDTO[]> {
    return this.destinationService.findAll(query);
  }

  @IsPublic(true)
  @Get(':destination')
  @FindOneDestinationSwagger()
  findOne(
    @Param('destination', new ZodValidationPipe(destinationParamSchema))
    destination: DestinatiosnEnum,
  ): Promise<DestinationResponseDTO> {
    return this.destinationService.findOne(destination);
  }

  @Put(':destination/image')
  @UseInterceptors(FileInterceptor('image'), FileCleanupInterceptor)
  @SetDestinationImageSwagger()
  setImage(
    @Param('destination', new ZodValidationPipe(destinationParamSchema))
    destination: DestinatiosnEnum,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<DestinationResponseDTO> {
    return this.destinationService.setImage(destination, file);
  }

  @Delete(':destination/image')
  @RemoveDestinationImageSwagger()
  removeImage(
    @Param('destination', new ZodValidationPipe(destinationParamSchema))
    destination: DestinatiosnEnum,
  ): Promise<DestinationResponseDTO> {
    return this.destinationService.removeImage(destination);
  }
}
