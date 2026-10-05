import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../mekong-ai/auth.service';

@Injectable()
export class TokenInterceptor implements HttpInterceptor {
  constructor(private authService: AuthService) {}

  intercept(
    request: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    // Skip adding token for the token endpoint itself
    if (request.url.includes('/protocol/openid-connect/token')) {
      return next.handle(request);
    }

    // Only add token for ERP APIs (apifcim.facenet.vn domain)
    const isErpApi = request.url.includes('apifcim.facenet.vn');

    if (isErpApi) {
      const authToken = this.authService.getCurrentToken();
      if (authToken) {
        request = request.clone({
          setHeaders: {
            Authorization: 'Bearer ' + authToken,
          },
        });
      }
    }

    return next.handle(request);
  }
}
