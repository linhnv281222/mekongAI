import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_expires_in: number;
  refresh_token: string;
  token_type: string;
  'not-before-policy': number;
  session_state: string;
  scope: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly TOKEN_URL = 'https://sso.xfactory.vn/auth/realms/fcim_cloud/protocol/openid-connect/token';
  private readonly USERNAME = 'admin@vnt.vn';
  private readonly PASSWORD = 'Facenet@123';
  private readonly CLIENT_ID = 'fcim_cloud';

  private tokenSubject = new BehaviorSubject<string>('');
  public token$ = this.tokenSubject.asObservable();

  constructor(private http: HttpClient) {}

  getToken(): Observable<TokenResponse> {
    const body = new URLSearchParams();
    body.set('username', this.USERNAME);
    body.set('password', this.PASSWORD);
    body.set('grant_type', 'password');
    body.set('client_id', this.CLIENT_ID);

    return this.http.post<TokenResponse>(this.TOKEN_URL, body.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }).pipe(
      tap(response => {
        this.tokenSubject.next(response.access_token);
        // Store token in sessionStorage for persistence
        sessionStorage.setItem('access_token', response.access_token);
        sessionStorage.setItem('refresh_token', response.refresh_token);
      })
    );
  }

  getCurrentToken(): string {
    // Try to get from BehaviorSubject first, fallback to sessionStorage
    const token = this.tokenSubject.value || sessionStorage.getItem('access_token') || '';
    return token;
  }

  refreshToken(): Observable<TokenResponse> {
    const refreshToken = sessionStorage.getItem('refresh_token') || '';
    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', refreshToken);
    body.set('client_id', this.CLIENT_ID);

    return this.http.post<TokenResponse>(this.TOKEN_URL, body.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }).pipe(
      tap(response => {
        this.tokenSubject.next(response.access_token);
        sessionStorage.setItem('access_token', response.access_token);
        sessionStorage.setItem('refresh_token', response.refresh_token);
      })
    );
  }

  clearToken(): void {
    this.tokenSubject.next('');
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
  }
}
