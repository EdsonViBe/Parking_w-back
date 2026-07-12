import {
  HttpErrorResponse,
  HttpInterceptorFn
} from '@angular/common/http';

import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (
  request,
  next
) => {
  const router = inject(Router);
  const token = localStorage.getItem('parking_token');

  const publicRoutes = [
    '/auth/login',
    '/auth/register'
  ];

  const isPublicRoute = publicRoutes.some(route =>
    request.url.includes(route)
  );

  let requestToSend = request;

  if (token && !isPublicRoute) {
    requestToSend = request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(requestToSend).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isPublicRoute) {
        localStorage.removeItem('parking_token');
        localStorage.removeItem('parking_user');

        router.navigate(['/login']);
      }

      return throwError(() => error);
    })
  );
};
