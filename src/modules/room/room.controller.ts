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
import { RoomService } from './room.service';
import type { CreateRoomDto, UpdateRoomDto } from './types/room.dto';
import { ZodValidationPipe } from 'src/pipes/zod.validation.pipe';
import {
  createRoomValidationSchema,
  updateRoomValidationSchema,
} from './util/room.validation';
import {
  CreateRoomSwagger,
  DeleteRoomSwagger,
  FindAllRoomsSwagger,
  FindOneRoomSwagger,
  UpdateRoomSwagger,
} from './swagger/room.swagger';

@ApiTags('Rooms')
@ApiBearerAuth()
@Controller('hotel/:hotelId/room')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Post()
  @CreateRoomSwagger()
  create(
    @Param('hotelId') hotelId: string,
    @Body(new ZodValidationPipe(createRoomValidationSchema)) dto: CreateRoomDto,
  ) {
    return this.roomService.create(hotelId, dto);
  }

  @IsPublic(true)
  @Get()
  @FindAllRoomsSwagger()
  findAll(@Param('hotelId') hotelId: string) {
    return this.roomService.findAll(hotelId);
  }

  @IsPublic(true)
  @Get(':id')
  @FindOneRoomSwagger()
  findOne(@Param('hotelId') hotelId: string, @Param('id') id: string) {
    return this.roomService.findOne(hotelId, id);
  }

  @Patch(':id')
  @UpdateRoomSwagger()
  update(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRoomValidationSchema)) dto: UpdateRoomDto,
  ) {
    return this.roomService.update(hotelId, id, dto);
  }

  @Delete(':id')
  @DeleteRoomSwagger()
  remove(@Param('hotelId') hotelId: string, @Param('id') id: string) {
    return this.roomService.remove(hotelId, id);
  }
}
