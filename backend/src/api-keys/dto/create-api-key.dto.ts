import { IsString, IsOptional, IsUUID, IsArray, IsDateString, IsBoolean } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsArray()
  @IsString({ each: true })
  permissions!: string[];

  @IsOptional()
  @IsBoolean()
  websocketEnabled?: boolean;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
