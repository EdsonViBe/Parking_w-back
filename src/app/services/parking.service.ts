import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  map,
  Observable,
  of,
  tap,
  throwError
} from 'rxjs';

import {
  ParkingSpace,
  SearchFilters
} from '../models/parking.model';

import { API_CONFIG } from '../config/api.config';

/**
 * Estructura general devuelta por las funciones Lambda.
 */
interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

/**
 * Estructura que devuelve el backend Python.
 *
 * Los nombres usan snake_case porque así llegan desde
 * SQL Server y las funciones Lambda.
 */
interface BackendParking {
  id: number;
  owner_id: number;

  title: string;
  address: string;
  district: string;
  description?: string | null;

  price_per_hour: number;
  total_spots: number;
  available_spots: number;

  open_time?: string | null;
  close_time?: string | null;

  latitude?: number | null;
  longitude?: number | null;

  image_url?: string | null;
  is_active: boolean;

  owner_name?: string | null;
  vehicle_types?: string[] | null;

  rating?: number | null;
  reviews?: number | null;
  parking_type?: string | null;
  features?: string[] | null;
}

/**
 * Datos que se envían al backend al crear o editar
 * un estacionamiento.
 */
interface ParkingRequest {
  title?: string;
  address?: string;
  district?: string;
  description?: string;

  price_per_hour?: number;
  total_spots?: number;
  available_spots?: number;

  open_time?: string;
  close_time?: string;

  latitude?: number;
  longitude?: number;

  image_url?: string;
  vehicle_types?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class ParkingService {
  /**
   * URL:
   * https://...execute-api...amazonaws.com/parkings
   */
  private readonly apiUrl =
    `${API_CONFIG.baseUrl}/parkings`;

  /**
   * Caché local de los estacionamientos descargados.
   *
   * Se utiliza para mantener métodos como getDistricts(),
   * que en el proyecto original devuelven información
   * de forma sincrónica.
   */
  private parkingSpaces: ParkingSpace[] = [];

  private readonly searchFilters$ =
    new BehaviorSubject<SearchFilters>({
      query: '',
      vehicleType: '',
      maxPrice: 20,
      type: '',
      district: '',
      minRating: 0
    });

  constructor(private http: HttpClient) {}

  /**
   * Obtiene todos los estacionamientos reales del backend.
   *
   * Ruta:
   * GET /parkings
   */
  getAll(): Observable<ParkingSpace[]> {
    return this.http
      .get<ApiResponse<BackendParking[]>>(this.apiUrl)
      .pipe(
        map(response => {
          const backendParkings =
            Array.isArray(response.data)
              ? response.data
              : [];

          return backendParkings.map(parking =>
            this.mapBackendParking(parking)
          );
        }),

        tap(parkings => {
          this.parkingSpaces = parkings;
        }),

        catchError(error =>
          this.handleError(error)
        )
      );
  }

  /**
   * Obtiene un estacionamiento específico.
   *
   * Ruta:
   * GET /parkings/{id}
   */
  getById(
    id: number
  ): Observable<ParkingSpace | undefined> {
    return this.http
      .get<ApiResponse<BackendParking>>(
        `${this.apiUrl}/${id}`
      )
      .pipe(
        map(response => {
          if (!response.data) {
            return undefined;
          }

          const parking =
            this.mapBackendParking(response.data);

          this.updateParkingInCache(parking);

          return parking;
        }),

        catchError((error: HttpErrorResponse) => {
          if (error.status === 404) {
            return of(undefined);
          }

          return this.handleError(error);
        })
      );
  }

  /**
   * Busca estacionamientos usando los filtros actuales.
   *
   * Por ahora el filtrado se realiza en Angular después
   * de descargar GET /parkings.
   */
  search(
    filters: SearchFilters
  ): Observable<ParkingSpace[]> {
    return this.getAll().pipe(
      map(parkings => {
        let results = [...parkings];

        if (filters.query?.trim()) {
          const query =
            filters.query.trim().toLowerCase();

          results = results.filter(parking =>
            parking.title
              .toLowerCase()
              .includes(query) ||

            parking.address
              .toLowerCase()
              .includes(query) ||

            parking.district
              .toLowerCase()
              .includes(query)
          );
        }

        if (filters.vehicleType) {
          results = results.filter(parking =>
            parking.vehicleTypes.includes(
              filters.vehicleType as never
            )
          );
        }

        if (filters.type) {
          results = results.filter(
            parking => parking.type === filters.type
          );
        }

        if (filters.district) {
          results = results.filter(
            parking =>
              parking.district === filters.district
          );
        }

        if (filters.maxPrice > 0) {
          results = results.filter(
            parking =>
              parking.price <= filters.maxPrice
          );
        }

        if (filters.minRating > 0) {
          results = results.filter(
            parking =>
              parking.rating >= filters.minRating
          );
        }

        return results;
      })
    );
  }

  /**
   * Devuelve los distritos descargados hasta el momento.
   *
   * Para que tenga datos, primero debe haberse ejecutado
   * getAll(), search() o getFeatured().
   */
  getDistricts(): string[] {
    return [
      ...new Set(
        this.parkingSpaces
          .map(parking => parking.district)
          .filter(district => Boolean(district))
      )
    ].sort();
  }

  /**
   * Obtiene estacionamientos destacados.
   *
   * Como la base todavía no maneja calificaciones reales,
   * se consideran destacados los que están disponibles.
   */
  getFeatured(): Observable<ParkingSpace[]> {
    return this.getAll().pipe(
      map(parkings =>
        parkings.filter(parking =>
          parking.available
        )
      )
    );
  }

  /**
   * Crea un estacionamiento.
   *
   * Ruta:
   * POST /parkings
   *
   * El interceptor agrega automáticamente el Bearer token.
   */
  create(
    parking: Partial<ParkingSpace>
  ): Observable<ParkingSpace> {
    const request =
      this.mapFrontendParking(parking);

    return this.http
      .post<ApiResponse<BackendParking>>(
        this.apiUrl,
        request
      )
      .pipe(
        map(response =>
          this.mapBackendParking(response.data)
        ),

        tap(createdParking => {
          this.parkingSpaces = [
            ...this.parkingSpaces,
            createdParking
          ];
        }),

        catchError(error =>
          this.handleError(error)
        )
      );
  }

  /**
   * Alias para componentes que puedan usar el nombre
   * createParking().
   */
  createParking(
    parking: Partial<ParkingSpace>
  ): Observable<ParkingSpace> {
    return this.create(parking);
  }

  /**
   * Actualiza un estacionamiento.
   *
   * Ruta:
   * PUT /parkings/{id}
   */
  update(
    id: number,
    parking: Partial<ParkingSpace>
  ): Observable<ParkingSpace> {
    const request =
      this.mapFrontendParking(parking);

    return this.http
      .put<ApiResponse<BackendParking>>(
        `${this.apiUrl}/${id}`,
        request
      )
      .pipe(
        map(response =>
          this.mapBackendParking(response.data)
        ),

        tap(updatedParking => {
          this.updateParkingInCache(updatedParking);
        }),

        catchError(error =>
          this.handleError(error)
        )
      );
  }

  /**
   * Alias para componentes que puedan usar
   * updateParking().
   */
  updateParking(
    id: number,
    parking: Partial<ParkingSpace>
  ): Observable<ParkingSpace> {
    return this.update(id, parking);
  }

  /**
   * Elimina o desactiva un estacionamiento.
   *
   * Ruta:
   * DELETE /parkings/{id}
   */
  delete(id: number): Observable<void> {
    return this.http
      .delete<ApiResponse<null>>(
        `${this.apiUrl}/${id}`
      )
      .pipe(
        tap(() => {
          this.parkingSpaces =
            this.parkingSpaces.filter(
              parking => parking.id !== id
            );
        }),

        map(() => undefined),

        catchError(error =>
          this.handleError(error)
        )
      );
  }

  /**
   * Alias para componentes que puedan usar
   * deleteParking().
   */
  deleteParking(id: number): Observable<void> {
    return this.delete(id);
  }

  updateFilters(
    filters: Partial<SearchFilters>
  ): void {
    this.searchFilters$.next({
      ...this.searchFilters$.value,
      ...filters
    });
  }

  getFilters(): Observable<SearchFilters> {
    return this.searchFilters$.asObservable();
  }

  /**
   * Convierte los datos de SQL Server/Lambda al modelo
   * que ya utiliza el frontend Angular.
   */
  private mapBackendParking(
    parking: BackendParking
  ): ParkingSpace {
    const price =
      Number(parking.price_per_hour ?? 0);

    const totalSpots =
      Number(parking.total_spots ?? 0);

    const availableSpots =
      Number(parking.available_spots ?? 0);

    return {
      id: Number(parking.id),

      title: parking.title ?? '',

      address: parking.address ?? '',

      district: parking.district ?? '',

      price,

      /*
       * La base actual solo guarda price_per_hour.
       * Se mantiene la regla temporal:
       * precio diario = precio por hora × 7.
       */
      priceDay: price * 7,

      /*
       * La base todavía no posee reseñas.
       * Se usan valores neutros para no romper las vistas.
       */
      rating: Number(parking.rating ?? 0),

      reviews: Number(parking.reviews ?? 0),

      type: this.mapBackendParkingType(
        parking.parking_type
      ),

      vehicleTypes: this.mapBackendVehicleTypes(
        parking.vehicle_types ?? []
      ),

      features:
        Array.isArray(parking.features)
          ? parking.features
          : [],

      available:
        Boolean(parking.is_active) &&
        availableSpots > 0,

      totalSpots,

      availableSpots,

      lat: Number(parking.latitude ?? 0),

      lng: Number(parking.longitude ?? 0),

      ownerId: Number(parking.owner_id ?? 0),

      ownerName:
        parking.owner_name ??
        'Propietario',

      images:
        parking.image_url
          ? [parking.image_url]
          : [],

      schedule: {
        open:
          this.normalizeTime(
            parking.open_time
          ) || '00:00',

        close:
          this.normalizeTime(
            parking.close_time
          ) || '23:59'
      },

      description:
        parking.description ?? ''
    };
  }

  /**
   * Convierte el modelo Angular al formato esperado
   * por las Lambdas Python.
   */
  private mapFrontendParking(
    parking: Partial<ParkingSpace>
  ): ParkingRequest {
    return {
      title: parking.title?.trim(),

      address: parking.address?.trim(),

      district: parking.district?.trim(),

      description:
        parking.description?.trim(),

      price_per_hour:
        parking.price !== undefined
          ? Number(parking.price)
          : undefined,

      total_spots:
        parking.totalSpots !== undefined
          ? Number(parking.totalSpots)
          : undefined,

      available_spots:
        parking.availableSpots !== undefined
          ? Number(parking.availableSpots)
          : parking.totalSpots !== undefined
            ? Number(parking.totalSpots)
            : undefined,

      open_time:
        parking.schedule?.open,

      close_time:
        parking.schedule?.close,

      latitude:
        parking.lat !== undefined
          ? Number(parking.lat)
          : undefined,

      longitude:
        parking.lng !== undefined
          ? Number(parking.lng)
          : undefined,

      image_url:
        parking.images?.[0] ?? '',

      vehicle_types:
        this.mapFrontendVehicleTypes(
          parking.vehicleTypes ?? []
        )
    };
  }

  /**
   * SQL Server devuelve TIME como "06:00:00".
   * La vista original utiliza "06:00".
   */
  private normalizeTime(
    value?: string | null
  ): string {
    if (!value) {
      return '';
    }

    return value.substring(0, 5);
  }

  /**
   * Traduce los tipos utilizados por el backend:
   *
   * car        → auto
   * motorcycle → moto
   * suv        → auto
   * bicycle    → bicicleta
   */
  private mapBackendVehicleTypes(
    types: string[]
  ): ParkingSpace['vehicleTypes'] {
    const mappedTypes = types.map(type => {
      switch (type) {
        case 'car':
          return 'auto';

        case 'motorcycle':
          return 'moto';

        case 'bicycle':
          return 'bicicleta';

        case 'suv':
          return 'auto';

        default:
          return type;
      }
    });

    return [
      ...new Set(mappedTypes)
    ] as ParkingSpace['vehicleTypes'];
  }

  /**
   * Traduce los tipos del frontend al backend.
   */
  private mapFrontendVehicleTypes(
    types: ParkingSpace['vehicleTypes']
  ): string[] {
    return [
      ...new Set(
        types.map(type => {
          switch (type) {
            case 'auto':
              return 'car';

            case 'moto':
              return 'motorcycle';

            case 'bicicleta':
              return 'bicycle';

            default:
              return String(type);
          }
        })
      )
    ];
  }

  /**
   * La base todavía no almacena el campo type.
   * Si no llega desde backend se usa "cubierto" para
   * mantener compatibilidad con las pantallas existentes.
   */
  private mapBackendParkingType(
    type?: string | null
  ): ParkingSpace['type'] {
    if (
      type === 'cubierto' ||
      type === 'descubierto' ||
      type === 'mixto'
    ) {
      return type;
    }

    return 'cubierto';
  }

  private updateParkingInCache(
    parking: ParkingSpace
  ): void {
    const index =
      this.parkingSpaces.findIndex(
        current => current.id === parking.id
      );

    if (index === -1) {
      this.parkingSpaces = [
        ...this.parkingSpaces,
        parking
      ];

      return;
    }

    const updatedParkings =
      [...this.parkingSpaces];

    updatedParkings[index] = parking;

    this.parkingSpaces = updatedParkings;
  }

  private handleError(
    error: HttpErrorResponse
  ): Observable<never> {
    console.error(
      'Error en ParkingService:',
      error
    );

    let message =
      'No se pudieron cargar los estacionamientos';

    if (error.status === 0) {
      message =
        'No se pudo conectar con el servidor';
    } else if (error.status === 401) {
      message =
        'Tu sesión no es válida o ha expirado';
    } else if (error.status === 403) {
      message =
        'No tienes permisos para realizar esta acción';
    } else if (error.status === 404) {
      message =
        'El estacionamiento no existe';
    } else if (error.error?.message) {
      message = error.error.message;
    }

    return throwError(() => new Error(message));
  }
}