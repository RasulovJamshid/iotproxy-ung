import { IsString, IsISO8601, IsObject, IsUUID } from 'class-validator';

export class SingleReadingDto {
  @IsUUID()
  sensorId!: string;

  @IsISO8601()
  phenomenonTime!: string;

  @IsObject()
  data!: Record<string, unknown>;
}
