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
import { IsPublic } from 'src/decorators/public.decorator';
import { AddonService } from './addon.service';
import type { CreateAddonDto, UpdateAddonDto } from './types/addon.dto';
import { ZodValidationPipe } from 'src/pipes/zod.validation.pipe';
import {
  createAddonValidationSchema,
  updateAddonValidationSchema,
} from './util/addon.validation';
import {
  CreateAddonSwagger,
  DeleteAddonSwagger,
  FindAllAddonsSwagger,
  FindOneAddonSwagger,
  UpdateAddonSwagger,
} from './swagger/addon.swagger';

@ApiTags('Addons')
@ApiBearerAuth()
@Controller('hotel/:hotelId/addon')
export class AddonController {
  constructor(private readonly addonService: AddonService) {}

  @Post()
  @CreateAddonSwagger()
  create(
    @Param('hotelId') hotelId: string,
    @Body(new ZodValidationPipe(createAddonValidationSchema))
    dto: CreateAddonDto,
  ) {
    return this.addonService.create(hotelId, dto);
  }

  @IsPublic(true)
  @Get()
  @FindAllAddonsSwagger()
  findAll(@Param('hotelId') hotelId: string) {
    return this.addonService.findAll(hotelId);
  }

  @IsPublic(true)
  @Get(':id')
  @FindOneAddonSwagger()
  findOne(@Param('hotelId') hotelId: string, @Param('id') id: string) {
    return this.addonService.findOne(hotelId, id);
  }

  @Patch(':id')
  @UpdateAddonSwagger()
  update(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAddonValidationSchema))
    dto: UpdateAddonDto,
  ) {
    return this.addonService.update(hotelId, id, dto);
  }

  @Delete(':id')
  @DeleteAddonSwagger()
  remove(@Param('hotelId') hotelId: string, @Param('id') id: string) {
    return this.addonService.remove(hotelId, id);
  }
}
