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
import { PhotoGalleryService } from './photo-gallery.service';
import { FilesInterceptor } from '@nestjs/platform-express';
import { FileCleanupInterceptor } from '../file/cleanup-file.interceptor';
import type { PhotoGalleryResponseDTO } from './types/photo-gallery.dto';
import {
  CreatePhotoGallerySwagger,
  FindAllPhotoGalleriesSwagger,
  FindOnePhotoGallerySwagger,
  DeletePhotoGallerySwagger,
} from './swagger/photo-gallery.swagger';

@ApiTags('معرض الصور')
@ApiBearerAuth()
@Controller('photo-gallery')
export class PhotoGalleryController {
  constructor(private readonly photoGalleryService: PhotoGalleryService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('images', 10), FileCleanupInterceptor)
  @CreatePhotoGallerySwagger()
  create(
    @UploadedFiles() files: Array<Express.Multer.File>,
  ): Promise<PhotoGalleryResponseDTO> {
    return this.photoGalleryService.create(files);
  }

  @IsPublic(true)
  @Get()
  @FindAllPhotoGalleriesSwagger()
  findAll() {
    return this.photoGalleryService.findAll();
  }

  @IsPublic(true)
  @Get(':id')
  @FindOnePhotoGallerySwagger()
  findOne(@Param('id') id: string) {
    return this.photoGalleryService.findOne(id);
  }

  @Delete(':id')
  @DeletePhotoGallerySwagger()
  remove(@Param('id') id: string) {
    return this.photoGalleryService.remove(id);
  }
}
