import { NgModule, APP_INITIALIZER } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClient } from '@angular/common/http';
import { MessagesModule } from 'primeng/messages';
import { RouterModule } from '@angular/router';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MekongAiModule } from './pages/mekong-ai/mekong-ai.module';
import { TokenInterceptor } from './services/interceptors/token-interceptor';
import { AuthService } from './services/mekong-ai/auth.service';

export function translateLoaderFactory(http: HttpClient): TranslateLoader {
  return {
    getTranslation: (lang: string) => http.get(`/assets/i18n/${lang}.json`),
  };
}

export function initializeApp(authService: AuthService): () => Promise<any> {
  return (): Promise<any> => {
    return new Promise((resolve, reject) => {
      authService.getToken().subscribe({
        next: () => {
          console.log('Token fetched successfully');
          resolve(true);
        },
        error: (error) => {
          console.error('Failed to fetch token:', error);
          // Resolve anyway to allow app to start
          resolve(true);
        }
      });
    });
  };
}

@NgModule({
  declarations: [AppComponent],
  bootstrap: [AppComponent],
  imports: [
    AppRoutingModule,
    BrowserModule,
    BrowserAnimationsModule,
    MessagesModule,
    RouterModule,
    TranslateModule.forRoot({
      defaultLanguage: 'vi',
      loader: {
        provide: TranslateLoader,
        useFactory: translateLoaderFactory,
        deps: [HttpClient],
      },
    }),
    MekongAiModule,
  ],
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: initializeApp,
      deps: [AuthService],
      multi: true,
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: TokenInterceptor,
      multi: true,
    },
    provideHttpClient(withInterceptorsFromDi()),
  ],
})
export class AppModule {}
