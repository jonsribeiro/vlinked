import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProfileDto {
  @ApiProperty({
    description: 'Nome de exibição',
    example: 'João Silva',
  })
  @IsString()
  @MaxLength(100)
  displayName: string;

  @ApiProperty({
    description: 'Slug único para URL',
    example: 'joao-silva',
  })
  @IsString()
  @MaxLength(50)
  slug: string;

  @ApiProperty({
    description: 'Biografia',
    example: 'Desenvolvedor full-stack apaixonado por tecnologia',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiProperty({
    description: 'Profissão',
    example: 'Desenvolvedor de Software',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  profession?: string;

  @ApiProperty({
    description: 'Cidade',
    example: 'São Paulo',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiProperty({
    description: 'Estado/Região',
    example: 'SP',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @ApiProperty({
    description: 'País',
    example: 'Brasil',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;
}
