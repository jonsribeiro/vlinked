import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiProperty({
    description: 'Nome de exibição',
    example: 'João Silva',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

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

  @ApiProperty({
    description: 'URL do avatar',
    example: 'https://cdn.vlinked.com/avatars/uuid.jpg',
    required: false,
  })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiProperty({
    description: 'URL do banner',
    example: 'https://cdn.vlinked.com/banners/uuid.jpg',
    required: false,
  })
  @IsOptional()
  @IsString()
  bannerUrl?: string;
}
