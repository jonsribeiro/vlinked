import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Version,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Perfis')
@Controller('profiles')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Post()
  @Version('1')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar perfil' })
  @ApiResponse({ status: 201, description: 'Perfil criado com sucesso' })
  @ApiResponse({ status: 409, description: 'Slug já existe ou perfil já existe' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createProfileDto: CreateProfileDto,
  ) {
    return this.profileService.create(user.userId, createProfileDto);
  }

  @Get('me')
  @Version('1')
  @ApiOperation({ summary: 'Buscar meu perfil' })
  @ApiResponse({ status: 200, description: 'Perfil encontrado' })
  @ApiResponse({ status: 404, description: 'Perfil não encontrado' })
  async getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.profileService.findByUserId(user.userId);
  }

  @Patch('me')
  @Version('1')
  @ApiOperation({ summary: 'Atualizar meu perfil' })
  @ApiResponse({ status: 200, description: 'Perfil atualizado' })
  async updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.profileService.update(user.userId, updateProfileDto);
  }

  @Public()
  @Get(':slug')
  @Version('1')
  @ApiOperation({ summary: 'Buscar perfil por slug' })
  @ApiResponse({ status: 200, description: 'Perfil encontrado' })
  @ApiResponse({ status: 404, description: 'Perfil não encontrado' })
  async findBySlug(@Param('slug') slug: string) {
    return this.profileService.findBySlug(slug);
  }
}
