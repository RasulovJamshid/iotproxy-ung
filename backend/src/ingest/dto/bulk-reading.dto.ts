import { IsArray, ValidateNested, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { SingleReadingDto } from './single-reading.dto';

export class BulkReadingDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SingleReadingDto)
  readings!: SingleReadingDto[];
}
