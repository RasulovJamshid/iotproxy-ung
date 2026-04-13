import { IsString, IsOptional, IsUUID, IsArray, IsDateString, IsBoolean, IsIn, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ScopeEntryDto {
  @IsUUID()
  orgId!: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;
}

export class CreateApiKeyDto {
  @IsString()
  name!: string;

  /** GLOBAL | ORGS | SITES — defaults to SITES for backward compat */
  @IsOptional()
  @IsIn(['GLOBAL', 'ORGS', 'SITES'])
  scopeType?: string;

  /** Required when scopeType is ORGS or SITES */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScopeEntryDto)
  scopes?: ScopeEntryDto[];

  /** Legacy single-site (used when scopeType omitted and scopes not provided) */
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
