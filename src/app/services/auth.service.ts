import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, catchError, map, Observable, of, tap } from 'rxjs';

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
  phone?: string;
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
  private readonly apiUrl = API_CONFIG.baseUrl;
  private readonly tokenKey = 'parking_token';
  private readonly userKey = 'parking_user';

  private readonly currentUserSubject =
    new BehaviorSubject<User | null>(null);

  constructor(private http: HttpClient) {
    this.loadUserFromStorage();
  }

  login(email: string, password: string): Observable<AuthResult> {
    return this.http
      .post<ApiResponse<LoginData>>(
        `${this.apiUrl}/auth/login`,
        {
          email: email.trim().toLowerCase(),
          password
        }
      )
      .pipe(
        tap(response => {
          if (
            response.success &&
            response.data?.token &&
            response.data.user
          ) {
            const user = this.mapBackendUser(response.data.user);

            localStorage.setItem(
              this.tokenKey,
              response.data.token
            );

            localStorage.setItem(
              this.userKey,
              JSON.stringify(user)
            );

            this.currentUserSubject.next(user);
          }
        }),
        map(response => {
          if (!response.success || !response.data?.user) {
            return {
              success: false,
              error: response.message ?? 'No se pudo iniciar sesión'
            };
          }

          return {
            success: true,
            user: this.mapBackendUser(response.data.user)
          };
        }),
        catchError(error => of(this.handleAuthError(error)))
      );
  }

  register(data: RegisterRequest): Observable<AuthResult> {
    const backendRole =
      data.role === 'propietario' ? 'owner' : 'driver';

    return this.http
      .post<ApiResponse<LoginData>>(
        `${this.apiUrl}/auth/register`,
        {
          name: data.name.trim(),
          email: data.email.trim().toLowerCase(),
          password: data.password,
          role: backendRole,
          phone: data.phone.trim()
        }
      )
      .pipe(
        tap(response => {
          if (
            response.success &&
            response.data?.token &&
            response.data.user
          ) {
            const user = this.mapBackendUser(response.data.user);

            localStorage.setItem(
              this.tokenKey,
              response.data.token
            );

            localStorage.setItem(
              this.userKey,
              JSON.stringify(user)
            );

            this.currentUserSubject.next(user);
          }
        }),
        map(response => {
          if (!response.success || !response.data?.user) {
            return {
              success: false,
              error: response.message ?? 'No se pudo registrar'
            };
          }

          return {
            success: true,
            user: this.mapBackendUser(response.data.user)
          };
        }),
        catchError(error => of(this.handleAuthError(error)))
      );
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.currentUserSubject.next(null);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getCurrentUser(): Observable<User | null> {
    return this.currentUserSubject.asObservable();
  }

  getCurrentUserValue(): User | null {
    return this.currentUserSubject.value;
  }

  isLoggedIn(): boolean {
    return Boolean(
      this.currentUserSubject.value && this.getToken()
    );
  }

  loadUserFromStorage(): void {
    const storedUser = localStorage.getItem(this.userKey);
    const token = this.getToken();

    if (!storedUser || !token) {
      this.currentUserSubject.next(null);
      return;
    }

    try {
      const user = JSON.parse(storedUser) as User;
      this.currentUserSubject.next(user);
    } catch {
      this.logout();
    }
  }

  switchRole(): void {
    const user = this.currentUserSubject.value;

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

    this.currentUserSubject.next(updatedUser);

    localStorage.setItem(
      this.userKey,
      JSON.stringify(updatedUser)
    );
  }

  private mapBackendUser(user: BackendUser): User {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role === 'owner'
        ? 'propietario'
        : 'conductor',
      phone: user.phone ?? ''
    };
  }

  private handleAuthError(
    error: HttpErrorResponse
  ): AuthResult {
    if (error.status === 0) {
      return {
        success: false,
        error: 'No se pudo conectar con el servidor'
      };
    }

    const backendMessage =
      error.error?.message ??
      error.error?.error ??
      error.error?.details;

    if (error.status === 401) {
      return {
        success: false,
        error: backendMessage ?? 'Correo o contraseña incorrectos'
      };
    }

    if (error.status === 409) {
      return {
        success: false,
        error: backendMessage ?? 'El correo ya está registrado'
      };
    }

    return {
      success: false,
      error: backendMessage ?? 'Ocurrió un error inesperado'
    };
  }
}