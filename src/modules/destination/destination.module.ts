import { Module } from '@nestjs/common';
import { DestinationService } from './destination.service';
import { DestinationController } from './destination.controller';
import { DatabaseService } from '../database/database.service';
import { FileModule } from '../file/file.module';

@Module({
  controllers: [DestinationController],
  providers: [DestinationService, DatabaseService],
  imports: [FileModule],
})
export class DestinationModule {}
