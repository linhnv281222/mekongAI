import { KeycloakService } from 'keycloak-angular';
import { environment } from '../environment/environment';

export function initializer(keycloak: KeycloakService): () => Promise<any> {
  return (): Promise<any> => {
    return new Promise(async (resolve, reject) => {
      try {
        await keycloak.init({
          config: {
            url: environment.keycloak.issuer,
            realm: environment.keycloak.realm,
            clientId: environment.keycloak.clientId,
          },
          loadUserProfileAtStartUp: false,
          initOptions: {
            onLoad: 'check-sso',
            checkLoginIframe: false,
          },
          bearerExcludedUrls: ['/assets', '/'],
          enableBearerInterceptor: false,
        });
        resolve(resolve);
      } catch (error) {
        reject(error);
      }
    });
  };
}
