import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';

import {
  BehaviorSubject,
  catchError,
  map,
  Observable,
  tap,
  throwError
} from 'rxjs';

import { API_CONFIG } from '../config/api.config';
import { Reservation } from '../models/parking.model';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
  details?: string;
}

/**
 * Formato que devuelve la Lambda de reservas.
 * Los campos llegan en snake_case desde Python/SQL Server.
 */
interface BackendReservation {
  id: number;
  user_id: number;
  parking_id: number;

  parking_title?: string | null;
  parking_address?: string | null;

  start_time: string;
  end_time: string;

  total_amount: number;

  status:
    | 'pending'
    | 'confirmed'
    | 'cancelled'
    | 'completed';

  vehicle_plate?: string | null;
  vehicle_type?: string | null;

  created_at: string;
  updated_at?: string | null;
}

/**
 * Datos usados por BookingComponent al crear una reserva.
 *
 * Conservamos la forma que ya utiliza tu frontend,
 * aunque el backend calcula nuevamente las horas
 * y el precio para evitar manipulaciones.
 */
type CreateReservationData =
  Omit<Reservation, 'id' | 'createdAt'>;

@Injectable({
  providedIn: 'root'
})
export class ReservationService {
  private readonly apiUrl =
    `${API_CONFIG.baseUrl}/reservations`;

  /**
   * Caché local para que las pantallas reciban
   * inmediatamente el último estado conocido.
   */
  private readonly reservationsSubject =
    new BehaviorSubject<Reservation[]>([]);

  constructor(private http: HttpClient) {}

  /**
   * Crea una reserva real.
   *
   * POST /reservations
   *
   * El interceptor agrega automáticamente:
   * Authorization: Bearer TOKEN
   */
  create(
    reservation: CreateReservationData
  ): Observable<Reservation> {
    const startTime = this.buildDateTime(
      reservation.date,
      reservation.startTime
    );

    const endTime = this.buildDateTime(
      reservation.date,
      reservation.endTime
    );

    const request = {
      parking_id: reservation.parkingId,
      start_time: startTime,
      end_time: endTime,

      /*
       * Se envían aunque el backend actual todavía
       * no los inserta. Quedan preparados para cuando
       * actualicemos la Lambda.
       */
      vehicle_plate: reservation.vehiclePlate,
      vehicle_type: this.mapVehicleTypeToBackend(
        reservation.vehicleType
      )
    };

    return this.http
      .post<ApiResponse<BackendReservation>>(
        this.apiUrl,
        request
      )
      .pipe(
        map(response =>
          this.mapBackendReservation(
            response.data,
            {
              parkingTitle: reservation.parkingTitle,
              parkingAddress: reservation.parkingAddress,
              vehiclePlate: reservation.vehiclePlate,
              vehicleType: reservation.vehicleType
            }
          )
        ),

        tap(createdReservation => {
          this.reservationsSubject.next([
            createdReservation,
            ...this.reservationsSubject.value
          ]);
        }),

        catchError(error =>
          this.handleError(error)
        )
      );
  }

  /**
   * Obtiene las reservas del usuario autenticado.
   *
   * El parámetro userId se conserva para no romper
   * MyReservationsComponent, pero el backend usa
   * el usuario contenido en el JWT.
   */
  getByUserId(
    userId: number
  ): Observable<Reservation[]> {
    void userId;

    return this.loadReservations();
  }

  /**
   * Obtiene reservas según el rol autenticado:
   *
   * conductor    → sus reservas
   * propietario  → reservas de sus estacionamientos
   */
  getAll(): Observable<Reservation[]> {
    return this.loadReservations();
  }

  /**
   * Cancela una reserva.
   *
   * PATCH /reservations/{id}
   */
  cancel(
    reservationId: number
  ): Observable<boolean> {
    return this.updateStatus(
      reservationId,
      'cancelled'
    ).pipe(
      map(() => true)
    );
  }

  /**
   * Confirma una reserva desde el panel
   * del propietario.
   *
   * PATCH /reservations/{id}
   */
  approve(
    reservationId: number
  ): Observable<boolean> {
    return this.updateStatus(
      reservationId,
      'confirmed'
    ).pipe(
      map(() => true)
    );
  }

  /**
   * Marca una reserva como completada.
   * Puede utilizarse posteriormente desde el panel.
   */
  complete(
    reservationId: number
  ): Observable<boolean> {
    return this.updateStatus(
      reservationId,
      'completed'
    ).pipe(
      map(() => true)
    );
  }

  /**
   * Devuelve el último estado almacenado localmente.
   */
  getCachedReservations(): Observable<Reservation[]> {
    return this.reservationsSubject.asObservable();
  }

  private loadReservations(): Observable<Reservation[]> {
    return this.http
      .get<ApiResponse<BackendReservation[]>>(
        this.apiUrl
      )
      .pipe(
        map(response => {
          const rows =
            Array.isArray(response.data)
              ? response.data
              : [];

          return rows.map(reservation =>
            this.mapBackendReservation(reservation)
          );
        }),

        tap(reservations => {
          this.reservationsSubject.next(reservations);
        }),

        catchError(error =>
          this.handleError(error)
        )
      );
  }

  private updateStatus(
    reservationId: number,
    status:
      | 'pending'
      | 'confirmed'
      | 'cancelled'
      | 'completed'
  ): Observable<Reservation> {
    return this.http
      .patch<ApiResponse<BackendReservation>>(
        `${this.apiUrl}/${reservationId}`,
        { status }
      )
      .pipe(
        map(response =>
          this.mapBackendReservation(response.data)
        ),

        tap(updatedReservation => {
          const updatedList =
            this.reservationsSubject.value.map(
              reservation =>
                reservation.id === updatedReservation.id
                  ? {
                      ...reservation,
                      ...updatedReservation
                    }
                  : reservation
            );

          this.reservationsSubject.next(updatedList);
        }),

        catchError(error =>
          this.handleError(error)
        )
      );
  }

  private mapBackendReservation(
    reservation: BackendReservation,
    fallback?: {
      parkingTitle?: string;
      parkingAddress?: string;
      vehiclePlate?: string;
      vehicleType?: string;
    }
  ): Reservation {
    const start = new Date(reservation.start_time);
    const end = new Date(reservation.end_time);

    const hours =
      Math.max(
        0,
        (end.getTime() - start.getTime()) /
          (1000 * 60 * 60)
      );

    return {
      id: Number(reservation.id),

      parkingId:
        Number(reservation.parking_id),

      parkingTitle:
        reservation.parking_title ??
        fallback?.parkingTitle ??
        'Estacionamiento',

      parkingAddress:
        reservation.parking_address ??
        fallback?.parkingAddress ??
        '',

      userId:
        Number(reservation.user_id),

      date:
        this.extractDate(
          reservation.start_time
        ),

      startTime:
        this.extractTime(
          reservation.start_time
        ),

      endTime:
        this.extractTime(
          reservation.end_time
        ),

      hours,

      totalPrice:
        Number(reservation.total_amount ?? 0),

      status:
        this.mapStatusToFrontend(
          reservation.status
        ),

      vehiclePlate:
        reservation.vehicle_plate ??
        fallback?.vehiclePlate ??
        '',

      vehicleType:
        this.mapVehicleTypeToFrontend(
          reservation.vehicle_type ??
          fallback?.vehicleType ??
          ''
        ),

      createdAt:
        reservation.created_at
    };
  }

  private buildDateTime(
    date: string,
    time: string
  ): string {
    const normalizedTime =
      time.length === 5
        ? `${time}:00`
        : time;

    return `${date}T${normalizedTime}`;
  }

  private extractDate(
    value: string
  ): string {
    if (!value) {
      return '';
    }

    return value.substring(0, 10);
  }

  private extractTime(
    value: string
  ): string {
    if (!value) {
      return '';
    }

    const separatorIndex =
      value.includes('T')
        ? value.indexOf('T')
        : value.indexOf(' ');

    if (separatorIndex === -1) {
      return value.substring(0, 5);
    }

    return value
      .substring(
        separatorIndex + 1,
        separatorIndex + 6
      );
  }

  private mapStatusToFrontend(
    status: BackendReservation['status']
  ): Reservation['status'] {
    switch (status) {
      case 'confirmed':
        return 'confirmada';

      case 'completed':
        return 'completada';

      case 'cancelled':
        return 'cancelada';

      case 'pending':
      default:
        return 'pendiente';
    }
  }

  private mapVehicleTypeToBackend(
    vehicleType: string
  ): string {
    switch (vehicleType) {
      case 'auto':
        return 'car';

      case 'moto':
        return 'motorcycle';

      case 'bicicleta':
        return 'bicycle';

      default:
        return vehicleType;
    }
  }

  private mapVehicleTypeToFrontend(
    vehicleType: string
  ): string {
    switch (vehicleType) {
      case 'car':
        return 'auto';

      case 'motorcycle':
        return 'moto';

      case 'bicycle':
        return 'bicicleta';

      default:
        return vehicleType;
    }
  }

  private handleError(
    error: HttpErrorResponse
  ): Observable<never> {
    console.error(
      'Error en ReservationService:',
      error
    );

    let message =
      'No se pudo procesar la reserva';

    if (error.status === 0) {
      message =
        'No se pudo conectar con el servidor';
    } else if (error.status === 400) {
      message =
        error.error?.message ??
        'Los datos de la reserva no son válidos';
    } else if (error.status === 401) {
      message =
        'Tu sesión no es válida o ha expirado';
    } else if (error.status === 403) {
      message =
        error.error?.message ??
        'No tienes permiso para realizar esta operación';
    } else if (error.status === 404) {
      message =
        error.error?.message ??
        'La reserva o el estacionamiento no existe';
    } else if (error.status === 409) {
      message =
        error.error?.message ??
        'No hay espacios disponibles';
    } else if (error.error?.message) {
      message = error.error.message;
    }

    return throwError(() => new Error(message));
  }
}