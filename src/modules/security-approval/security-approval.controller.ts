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
import { Airline, Nationality } from 'generated/prisma/client';
import { SecurityApprovalService } from './security-approval.service';
import { ZodValidationPipe } from 'src/pipes/zod.validation.pipe';
import {
  createSecurityServiceTypeSchema,
  updateSecurityServiceTypeSchema,
  createAirlinePricingSchema,
  updateAirlinePricingSchema,
  createNationalityPricingSchema,
  updateNationalityPricingSchema,
} from './util/security-approval.validation';
import type {
  CreateSecurityServiceTypeDto,
  UpdateSecurityServiceTypeDto,
  CreateAirlinePricingDto,
  UpdateAirlinePricingDto,
  CreateNationalityPricingDto,
  UpdateNationalityPricingDto,
} from './types/security-approval.dto';
import {
  CreateSecurityServiceTypeSwagger,
  FindAllSecurityServiceTypesSwagger,
  FindOneSecurityServiceTypeSwagger,
  UpdateSecurityServiceTypeSwagger,
  DeleteSecurityServiceTypeSwagger,
  GetAllAirlinesSwagger,
  CreateAirlinePricingSwagger,
  FindAllAirlinePricingSwagger,
  FindOneAirlinePricingSwagger,
  FindAirlinePricingByAirlineSwagger,
  UpdateAirlinePricingSwagger,
  DeleteAirlinePricingSwagger,
  GetAllNationalitiesSwagger,
  CreateNationalityPricingSwagger,
  FindAllNationalityPricingSwagger,
  FindOneNationalityPricingSwagger,
  FindNationalityPricingByNationalitySwagger,
  UpdateNationalityPricingSwagger,
  DeleteNationalityPricingSwagger,
} from './swagger/security-approval.swagger';

@ApiTags('الموافقات الأمنية')
@ApiBearerAuth()
@Controller('security-approval')
export class SecurityApprovalController {
  constructor(private readonly service: SecurityApprovalService) {}

  // ─── Security Service Types ───────────────────────────────────────────────

  @Post('service-type')
  @CreateSecurityServiceTypeSwagger()
  createServiceType(
    @Body(new ZodValidationPipe(createSecurityServiceTypeSchema))
    dto: CreateSecurityServiceTypeDto,
  ) {
    return this.service.createServiceType(dto);
  }

  @IsPublic(true)
  @Get('service-type')
  @FindAllSecurityServiceTypesSwagger()
  findAllServiceTypes() {
    return this.service.findAllServiceTypes();
  }

  @IsPublic(true)
  @Get('service-type/:id')
  @FindOneSecurityServiceTypeSwagger()
  findOneServiceType(@Param('id') id: string) {
    return this.service.findOneServiceType(id);
  }

  @Patch('service-type/:id')
  @UpdateSecurityServiceTypeSwagger()
  updateServiceType(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSecurityServiceTypeSchema))
    dto: UpdateSecurityServiceTypeDto,
  ) {
    return this.service.updateServiceType(id, dto);
  }

  @Delete('service-type/:id')
  @DeleteSecurityServiceTypeSwagger()
  removeServiceType(@Param('id') id: string) {
    return this.service.removeServiceType(id);
  }

  // ─── Airline Pricing ─────────────────────────────────────────────────────

  @IsPublic(true)
  @Get('airlines')
  @GetAllAirlinesSwagger()
  getAllAirlines() {
    return this.service.getAllAirlines();
  }

  @Post('airline-pricing')
  @CreateAirlinePricingSwagger()
  createAirlinePricing(
    @Body(new ZodValidationPipe(createAirlinePricingSchema))
    dto: CreateAirlinePricingDto,
  ) {
    return this.service.createAirlinePricing(dto);
  }

  @IsPublic(true)
  @Get('airline-pricing')
  @FindAllAirlinePricingSwagger()
  findAllAirlinePricing() {
    return this.service.findAllAirlinePricing();
  }

  @IsPublic(true)
  @Get('airline-pricing/by-airline/:airline')
  @FindAirlinePricingByAirlineSwagger()
  findAirlinePricingByAirline(@Param('airline') airline: Airline) {
    return this.service.findAirlinePricingByAirline(airline);
  }

  @IsPublic(true)
  @Get('airline-pricing/:id')
  @FindOneAirlinePricingSwagger()
  findOneAirlinePricing(@Param('id') id: string) {
    return this.service.findOneAirlinePricing(id);
  }

  @Patch('airline-pricing/:id')
  @UpdateAirlinePricingSwagger()
  updateAirlinePricing(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAirlinePricingSchema))
    dto: UpdateAirlinePricingDto,
  ) {
    return this.service.updateAirlinePricing(id, dto);
  }

  @Delete('airline-pricing/:id')
  @DeleteAirlinePricingSwagger()
  removeAirlinePricing(@Param('id') id: string) {
    return this.service.removeAirlinePricing(id);
  }

  // ─── Nationality Pricing ──────────────────────────────────────────────────

  @IsPublic(true)
  @Get('nationalities')
  @GetAllNationalitiesSwagger()
  getAllNationalities() {
    return this.service.getAllNationalities();
  }

  @Post('nationality-pricing')
  @CreateNationalityPricingSwagger()
  createNationalityPricing(
    @Body(new ZodValidationPipe(createNationalityPricingSchema))
    dto: CreateNationalityPricingDto,
  ) {
    return this.service.createNationalityPricing(dto);
  }

  @IsPublic(true)
  @Get('nationality-pricing')
  @FindAllNationalityPricingSwagger()
  findAllNationalityPricing() {
    return this.service.findAllNationalityPricing();
  }

  @IsPublic(true)
  @Get('nationality-pricing/by-nationality/:nationality')
  @FindNationalityPricingByNationalitySwagger()
  findNationalityPricingByNationality(
    @Param('nationality') nationality: Nationality,
  ) {
    return this.service.findNationalityPricingByNationality(nationality);
  }

  @IsPublic(true)
  @Get('nationality-pricing/:id')
  @FindOneNationalityPricingSwagger()
  findOneNationalityPricing(@Param('id') id: string) {
    return this.service.findOneNationalityPricing(id);
  }

  @Patch('nationality-pricing/:id')
  @UpdateNationalityPricingSwagger()
  updateNationalityPricing(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateNationalityPricingSchema))
    dto: UpdateNationalityPricingDto,
  ) {
    return this.service.updateNationalityPricing(id, dto);
  }

  @Delete('nationality-pricing/:id')
  @DeleteNationalityPricingSwagger()
  removeNationalityPricing(@Param('id') id: string) {
    return this.service.removeNationalityPricing(id);
  }
}
