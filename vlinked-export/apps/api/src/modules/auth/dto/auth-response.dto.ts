import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({
    description: 'Access token JWT',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Refresh token para renovação',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'Tipo do token',
    example: 'Bearer',
  })
  tokenType: string;

  @ApiProperty({
    description: 'Tempo de expiração do access token em segundos',
    example: 900,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'Dados do usuário',
  })
  user: {
    id: string;
    email: string;
    role: string;
    emailVerified: boolean;
  };
}
