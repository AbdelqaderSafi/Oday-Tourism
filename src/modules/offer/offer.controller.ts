import {
  Controller,
  Get,
  Post,
  Param,
  Delete,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsPublic } from 'src/decorators/public.decorator';
import { OfferService } from './offer.service';
import { FilesInterceptor } from '@nestjs/platform-express';
import { FileCleanupInterceptor } from '../file/cleanup-file.interceptor';
import type { OfferResponseDTO } from './types/offer.dto';

import {
  CreateOfferSwagger,
  FindAllOffersSwagger,
  FindOneOfferSwagger,
  DeleteOfferSwagger,
} from './swagger/offer.swagger';
@ApiTags('Offers')
@ApiBearerAuth()
@Controller('offer')
export class OfferController {
  constructor(private readonly offerService: OfferService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('images', 10), FileCleanupInterceptor)
  @CreateOfferSwagger()
  create(
    @UploadedFiles() files: Array<Express.Multer.File>,
  ): Promise<OfferResponseDTO> {
    return this.offerService.create(files);
  }

  @IsPublic(true)
  @Get()
  @FindAllOffersSwagger()
  findAll() {
    return this.offerService.findAll();
  }

  @IsPublic(true)
  @Get(':id')
  @FindOneOfferSwagger()
  findOne(@Param('id') id: string) {
    return this.offerService.findOne(id);
  }

  @Delete(':id')
  @DeleteOfferSwagger()
  remove(@Param('id') id: string) {
    return this.offerService.remove(id);
  }
}
