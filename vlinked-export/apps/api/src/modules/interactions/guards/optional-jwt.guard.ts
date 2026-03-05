import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

/**
 * Guard que permite requisições autenticadas ou anônimas
 * Útil para endpoints como track view onde usuários logados e anônimos podem acessar
 */
@Injectable()
export class OptionalJwtGuard extends AuthGuard('jwt') {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Adicionar flag para indicar que é opcional
    const request = context.switchToHttp().getRequest();
    request.optionalAuth = true;
    
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // Se não houver usuário autenticado, retornar undefined (permitir anônimo)
    if (!user) {
      return undefined;
    }
    
    return user;
  }
}
