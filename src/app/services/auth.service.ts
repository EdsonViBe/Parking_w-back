import {
  HttpClient,
  HttpErrorResponse
} from '@angular/common/http';

import { Injectable } from '@angular/core';

import {
  BehaviorSubject,
  catchError,
  map,
  Observable,
  of
} from 'rxjs';

import { User } from '../models/parking.model';
import { API_CONFIG } from '../config/api.config';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

interface BackendUser {
  id: number;
  name: string;
  email: string;
  role: 'driver' | 'owner' | 'admin';
  phone?: string | null;
}

interface LoginData {
  token: string;
  user: BackendUser;
}

interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  role: 'conductor' | 'propietario';
  phone: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly apiUrl =
    API_CONFIG.baseUrl;

  private readonly tokenKey =
    'parking_token';

  private readonly userKey =
    'parking_user';

  private readonly currentUserSubject =
    new BehaviorSubject<User | null>(null);

  constructor(
    private http: HttpClient
  ) {
    this.loadUserFromStorage();
  }

  /**
   * Inicia sesión mediante API Gateway.
   *
   * Si las credenciales son correctas:
   * - guarda el JWT;
   * - guarda el usuario;
   * - actualiza el usuario observable.
   */
  login(
    email: string,
    password: string
  ): Observable<AuthResult> {
    return this.http
      .post<ApiResponse<LoginData>>(
        `${this.apiUrl}/auth/login`,
        {
          email:
            email.trim().toLowerCase(),
          password
        }
      )
      .pipe(
        map(response => {
          if (
            !response.success ||
            !response.data?.token ||
            !response.data.user
          ) {
            return {
              success: false,
              error:
                response.message ??
                'No se pudo iniciar sesión'
            };
          }

          const user =
            this.mapBackendUser(
              response.data.user
            );

          this.saveSession(
            response.data.token,
            user
          );

          return {
            success: true,
            user
          };
        }),

        catchError(error =>
          of(this.handleAuthError(error))
        )
      );
  }

  /**
   * Registra un usuario nuevo.
   *
   * Convierte los roles del frontend:
   *
   * conductor    -> driver
   * propietario  -> owner
   */
  register(
    data: RegisterRequest
  ): Observable<AuthResult> {
    const backendRole:
      'driver' | 'owner' =
        data.role === 'propietario'
          ? 'owner'
          : 'driver';

    return this.http
      .post<ApiResponse<LoginData>>(
        `${this.apiUrl}/auth/register`,
        {
          name: data.name.trim(),
          email:
            data.email
              .trim()
              .toLowerCase(),
          password: data.password,
          role: backendRole,
          phone: data.phone.trim()
        }
      )
      .pipe(
        map(response => {
          if (
            !response.success ||
            !response.data?.token ||
            !response.data.user
          ) {
            return {
              success: false,
              error:
                response.message ??
                'No se pudo registrar'
            };
          }

          const user =
            this.mapBackendUser(
              response.data.user
            );

          this.saveSession(
            response.data.token,
            user
          );

          return {
            success: true,
            user
          };
        }),

        catchError(error =>
          of(this.handleAuthError(error))
        )
      );
  }

  /**
   * Elimina el token y el usuario guardado.
   */
  logout(): void {
    localStorage.removeItem(
      this.tokenKey
    );

    localStorage.removeItem(
      this.userKey
    );

    this.currentUserSubject.next(null);
  }

  /**
   * Devuelve el JWT guardado.
   *
   * El interceptor utiliza este método para
   * agregar Authorization: Bearer TOKEN.
   */
  getToken(): string | null {
    return localStorage.getItem(
      this.tokenKey
    );
  }

  /**
   * Observable del usuario autenticado.
   */
  getCurrentUser():
    Observable<User | null> {
    return this.currentUserSubject
      .asObservable();
  }

  /**
   * Devuelve inmediatamente el usuario actual.
   */
  getCurrentUserValue():
    User | null {
    return this.currentUserSubject.value;
  }

  /**
   * Comprueba si existe usuario y token.
   */
  isLoggedIn(): boolean {
    return Boolean(
      this.currentUserSubject.value &&
      this.getToken()
    );
  }

  /**
   * Recupera la sesión desde localStorage
   * cuando Angular vuelve a cargar.
   */
  loadUserFromStorage(): void {
    const storedUser =
      localStorage.getItem(
        this.userKey
      );

    const token = this.getToken();

    if (!storedUser || !token) {
      this.currentUserSubject.next(null);
      return;
    }

    try {
      const user =
        JSON.parse(storedUser) as User;

      this.currentUserSubject.next(user);
    } catch {
      this.logout();
    }
  }

  /**
   * Consulta el perfil real desde la base de datos.
   *
   * GET /users/me
   */
  refreshProfile():
    Observable<User | null> {
    return this.http
      .get<ApiResponse<BackendUser>>(
        `${this.apiUrl}/users/me`
      )
      .pipe(
        map(response => {
          if (
            !response.success ||
            !response.data
          ) {
            return null;
          }

          const user =
            this.mapBackendUser(
              response.data
            );

          this.saveUser(user);

          return user;
        }),

        catchError(error => {
          console.error(
            'No se pudo cargar el perfil:',
            error
          );

          return of(null);
        })
      );
  }

  /**
   * Actualiza nombre y teléfono.
   *
   * PUT /users/me
   */
  updateProfile(data: {
    name: string;
    phone: string;
  }): Observable<AuthResult> {
    return this.http
      .put<ApiResponse<BackendUser>>(
        `${this.apiUrl}/users/me`,
        {
          name: data.name.trim(),
          phone: data.phone.trim()
        }
      )
      .pipe(
        map(response => {
          if (
            !response.success ||
            !response.data
          ) {
            return {
              success: false,
              error:
                response.message ??
                'No se pudo actualizar el perfil'
            };
          }

          const user =
            this.mapBackendUser(
              response.data
            );

          this.saveUser(user);

          return {
            success: true,
            user
          };
        }),

        catchError(error =>
          of(this.handleAuthError(error))
        )
      );
  }

  /**
   * Cambia temporalmente el modo visual del usuario.
   *
   * Este cambio solo se guarda localmente.
   * No modifica el rol real en la base de datos
   * ni el rol contenido dentro del JWT.
   */
  switchRole(): void {
    const user =
      this.currentUserSubject.value;

    if (!user) {
      return;
    }

    const updatedUser: User = {
      ...user,
      role:
        user.role === 'conductor'
          ? 'propietario'
          : 'conductor'
    };

    this.saveUser(updatedUser);
  }

  /**
   * Guarda token y usuario después del
   * login o registro.
   */
  private saveSession(
    token: string,
    user: User
  ): void {
    localStorage.setItem(
      this.tokenKey,
      token
    );

    this.saveUser(user);
  }

  /**
   * Guarda el usuario y notifica el cambio
   * a los componentes suscritos.
   */
  private saveUser(
    user: User
  ): void {
    localStorage.setItem(
      this.userKey,
      JSON.stringify(user)
    );

    this.currentUserSubject.next(user);
  }

  /**
   * Convierte el usuario del backend
   * al formato utilizado por Angular.
   */
  private mapBackendUser(
    user: BackendUser
  ): User {
    return {
      id: Number(user.id),
      name: user.name,
      email: user.email,
      role:
        user.role === 'owner'
          ? 'propietario'
          : 'conductor',
      phone: user.phone ?? ''
    };
  }

  /**
   * Convierte errores HTTP en mensajes
   * comprensibles para login, registro
   * y actualización de perfil.
   */
  private handleAuthError(
    error: HttpErrorResponse
  ): AuthResult {
    if (error.status === 0) {
      return {
        success: false,
        error:
          'No se pudo conectar con el servidor'
      };
    }

    const backendMessage =
      error.error?.message ??
      error.error?.error ??
      error.error?.details;

    if (error.status === 400) {
      return {
        success: false,
        error:
          backendMessage ??
          'Los datos enviados no son válidos'
      };
    }

    if (error.status === 401) {
      return {
        success: false,
        error:
          backendMessage ??
          'Correo o contraseña incorrectos'
      };
    }

    if (error.status === 403) {
      return {
        success: false,
        error:
          backendMessage ??
          'No tienes permiso para realizar esta operación'
      };
    }

    if (error.status === 409) {
      return {
        success: false,
        error:
          backendMessage ??
          'El correo ya está registrado'
      };
    }

    return {
      success: false,
      error:
        backendMessage ??
        'Ocurrió un error inesperado'
    };
  }
}