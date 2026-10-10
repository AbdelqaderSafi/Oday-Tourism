import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsPublic } from 'src/decorators/public.decorator';
import { QuestionService } from './question.service';
import type { CreateQuestionDto, UpdateQuestionDto } from './types/question.dto';
import { ZodValidationPipe } from 'src/pipes/zod.validation.pipe';
import {
  createQuestionSchema,
  updateQuestionSchema,
  questionPaginationSchema,
} from './util/question.validation';
import {
  CreateQuestionSwagger,
  FindAllQuestionsSwagger,
  FindOneQuestionSwagger,
  UpdateQuestionSwagger,
  DeleteQuestionSwagger,
} from './swagger/question.swagger';
import type { PaginationQueryType } from 'src/types/util.types';

@ApiTags('Questions')
@ApiBearerAuth()
@Controller('question')
export class QuestionController {
  constructor(private readonly questionService: QuestionService) {}

  @Post()
  @CreateQuestionSwagger()
  create(
    @Body(new ZodValidationPipe(createQuestionSchema)) dto: CreateQuestionDto,
  ) {
    return this.questionService.create(dto);
  }

  @IsPublic(true)
  @Get()
  @FindAllQuestionsSwagger()
  findAll(
    @Query(new ZodValidationPipe(questionPaginationSchema))
    query: PaginationQueryType,
  ) {
    return this.questionService.findAll(query);
  }

  @IsPublic(true)
  @Get(':id')
  @FindOneQuestionSwagger()
  findOne(@Param('id') id: string) {
    return this.questionService.findOne(id);
  }

  @Patch(':id')
  @UpdateQuestionSwagger()
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateQuestionSchema)) dto: UpdateQuestionDto,
  ) {
    return this.questionService.update(id, dto);
  }

  @Delete(':id')
  @DeleteQuestionSwagger()
  remove(@Param('id') id: string) {
    return this.questionService.remove(id);
  }
}
