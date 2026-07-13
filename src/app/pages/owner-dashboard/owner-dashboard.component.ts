import {
  Component,
  OnInit
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  ActivatedRoute,
  RouterLink
} from '@angular/router';

import { forkJoin } from 'rxjs';

import {
  ParkingSpace,
  Reservation
} from '../../models/parking.model';

import { ParkingService } from '../../services/parking.service';
import { ReservationService } from '../../services/reservation.service';
import { FormPersistenceService } from '../../services/form-persistence.service';
import { AuthService } from '../../services/auth.service';

interface SpaceFormData {
  title: string;
  address: string;
  district: string;
  price: number;
  type: 'cubierto' | 'descubierto' | 'mixto';
  totalSpots: number;
  description: string;
  openTime: string;
  closeTime: string;
}

@Component({
  selector: 'app-owner-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink
  ],
  templateUrl:
    './owner-dashboard.component.html',
  styleUrls: [
    './owner-dashboard.component.css'
  ]
})
export class OwnerDashboardComponent
  implements OnInit {

  mySpaces: ParkingSpace[] = [];
  pendingReservations: Reservation[] = [];

  showAddForm = false;
  loading = false;
  saving = false;

  accessDeniedRole: string | null = null;
  restoredFromCookie = false;

  formError = '';
  pageError = '';

  editingSpaceId: number | null = null;

  private readonly FORM_KEY =
    'nuevo_espacio';

  newSpace: SpaceFormData =
    this.getEmptyForm();

  editSpace: SpaceFormData =
    this.getEmptyForm();

  stats = {
    totalReservations: 0,
    monthlyIncome: 0,
    rating: 0,
    activeSpaces: 0
  };

  constructor(
    private parkingService: ParkingService,
    private reservationService:
      ReservationService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private formPersistence:
      FormPersistenceService
  ) {}

  ngOnInit(): void {
    this.accessDeniedRole =
      this.route.snapshot.queryParamMap.get(
        'accesoDenegado'
      );

    const saved =
      this.formPersistence.load(
        this.FORM_KEY
      );

    if (saved) {
      this.newSpace = {
        ...this.getEmptyForm(),
        ...saved
      };

      this.restoredFromCookie = true;
    }

    this.loadDashboard();
  }

  loadDashboard(): void {
    this.loading = true;
    this.pageError = '';

    forkJoin({
      spaces:
        this.parkingService.getAll(),

      reservations:
        this.reservationService.getAll()
    }).subscribe({
      next: ({
        spaces,
        reservations
      }) => {
        const currentUser =
          this.authService
            .getCurrentUserValue();

        /*
         * GET /parkings devuelve todos los
         * estacionamientos públicos.
         *
         * Por eso filtramos los que pertenecen
         * al propietario autenticado.
         */
        this.mySpaces = spaces.filter(
          space =>
            space.ownerId ===
            currentUser?.id
        );

        this.pendingReservations =
          reservations.filter(
            reservation =>
              reservation.status ===
              'pendiente'
          );

        this.calculateStats(reservations);

        this.loading = false;
      },

      error: error => {
        console.error(
          'Error al cargar el panel:',
          error
        );

        this.pageError =
          error?.message ??
          'No se pudo cargar el panel';

        this.loading = false;
      }
    });
  }

  onFieldChange(): void {
    this.formPersistence.save(
      this.FORM_KEY,
      this.newSpace
    );
  }

  toggleAddForm(): void {
    this.showAddForm =
      !this.showAddForm;

    this.formError = '';
  }

  addSpace(): void {
    this.formError = '';

    if (!this.isFormValid(
      this.newSpace
    )) {
      return;
    }

    this.saving = true;

    this.parkingService
      .create(
        this.formToParking(
          this.newSpace
        )
      )
      .subscribe({
        next: createdSpace => {
          this.mySpaces = [
            createdSpace,
            ...this.mySpaces
          ];

          this.stats.activeSpaces =
            this.mySpaces.length;

          this.showAddForm = false;
          this.saving = false;

          this.formPersistence.clear(
            this.FORM_KEY
          );

          this.restoredFromCookie =
            false;

          this.newSpace =
            this.getEmptyForm();

          alert(
            '✅ Espacio registrado correctamente.'
          );
        },

        error: error => {
          this.saving = false;

          this.formError =
            error?.message ??
            'No se pudo registrar el espacio';
        }
      });
  }

  startEdit(
    space: ParkingSpace
  ): void {
    this.editingSpaceId = space.id;

    this.editSpace = {
      title: space.title,
      address: space.address,
      district: space.district,
      price: space.price,
      type: space.type,
      totalSpots:
        space.totalSpots,
      description:
        space.description,
      openTime:
        space.schedule.open,
      closeTime:
        space.schedule.close
    };
  }

  cancelEdit(): void {
    this.editingSpaceId = null;
  }

  saveEdit(): void {
    if (
      this.editingSpaceId === null
    ) {
      return;
    }

    this.formError = '';

    if (!this.isFormValid(
      this.editSpace
    )) {
      return;
    }

    const id =
      this.editingSpaceId;

    this.saving = true;

    this.parkingService
      .update(
        id,
        this.formToParking(
          this.editSpace
        )
      )
      .subscribe({
        next: updatedSpace => {
          this.mySpaces =
            this.mySpaces.map(
              space =>
                space.id === id
                  ? updatedSpace
                  : space
            );

          this.editingSpaceId =
            null;

          this.saving = false;

          alert(
            '✅ Espacio actualizado correctamente.'
          );
        },

        error: error => {
          this.saving = false;

          this.formError =
            error?.message ??
            'No se pudo actualizar el espacio';
        }
      });
  }

  deleteSpace(
    space: ParkingSpace
  ): void {
    const confirmed = confirm(
      `¿Deseas eliminar "${space.title}"?`
    );

    if (!confirmed) {
      return;
    }

    this.parkingService
      .delete(space.id)
      .subscribe({
        next: () => {
          this.mySpaces =
            this.mySpaces.filter(
              current =>
                current.id !== space.id
            );

          this.stats.activeSpaces =
            this.mySpaces.length;

          alert(
            '✅ Espacio eliminado correctamente.'
          );
        },

        error: error => {
          alert(
            error?.message ??
            'No se pudo eliminar el espacio'
          );
        }
      });
  }

  approveReservation(
    id: number
  ): void {
    this.reservationService
      .approve(id)
      .subscribe({
        next: () => {
          this.pendingReservations =
            this.pendingReservations.filter(
              reservation =>
                reservation.id !== id
            );

          alert(
            '✅ Reserva aprobada correctamente.'
          );
        },

        error: error => {
          alert(
            error?.message ??
            'No se pudo aprobar la reserva'
          );
        }
      });
  }

  cancelReservation(
    id: number
  ): void {
    const confirmed = confirm(
      '¿Deseas cancelar esta reserva?'
    );

    if (!confirmed) {
      return;
    }

    this.reservationService
      .cancel(id)
      .subscribe({
        next: () => {
          this.pendingReservations =
            this.pendingReservations.filter(
              reservation =>
                reservation.id !== id
            );

          alert(
            '✅ Reserva cancelada.'
          );
        },

        error: error => {
          alert(
            error?.message ??
            'No se pudo cancelar la reserva'
          );
        }
      });
  }

  private calculateStats(
    reservations: Reservation[]
  ): void {
    const validReservations =
      reservations.filter(
        reservation =>
          reservation.status !==
          'cancelada'
      );

    this.stats = {
      totalReservations:
        reservations.length,

      monthlyIncome:
        validReservations
          .filter(
            reservation =>
              reservation.status ===
              'confirmada' ||
              reservation.status ===
              'completada'
          )
          .reduce(
            (total, reservation) =>
              total +
              Number(
                reservation.totalPrice
              ),
            0
          ),

      rating: 0,

      activeSpaces:
        this.mySpaces.length
    };
  }

  private formToParking(
    form: SpaceFormData
  ): Partial<ParkingSpace> {
    return {
      title: form.title.trim(),
      address:
        form.address.trim(),
      district:
        form.district.trim(),

      price:
        Number(form.price),

      priceDay:
        Number(form.price) * 7,

      type: form.type,

      vehicleTypes: [
        'auto',
        'moto'
      ],

      features: [],

      available: true,

      totalSpots:
        Number(form.totalSpots),

      availableSpots:
        Number(form.totalSpots),

      lat: 0,
      lng: 0,

      images: [],

      schedule: {
        open: form.openTime,
        close: form.closeTime
      },

      description:
        form.description.trim()
    };
  }

  private isFormValid(
    form: SpaceFormData
  ): boolean {
    if (!form.title.trim()) {
      this.formError =
        'El nombre del espacio es obligatorio.';
      return false;
    }

    if (!form.address.trim()) {
      this.formError =
        'La dirección es obligatoria.';
      return false;
    }

    if (!form.district.trim()) {
      this.formError =
        'El distrito es obligatorio.';
      return false;
    }

    if (
      !Number.isFinite(
        Number(form.price)
      ) ||
      Number(form.price) <= 0
    ) {
      this.formError =
        'El precio debe ser mayor que cero.';
      return false;
    }

    if (
      !Number.isInteger(
        Number(form.totalSpots)
      ) ||
      Number(form.totalSpots) < 1
    ) {
      this.formError =
        'La cantidad de espacios debe ser al menos 1.';
      return false;
    }

    if (!this.areHoursValid(form)) {
      this.formError =
        'El cierre debe ser posterior a la apertura.';
      return false;
    }

    return true;
  }

  private areHoursValid(
    form: SpaceFormData
  ): boolean {
    if (
      !form.openTime ||
      !form.closeTime
    ) {
      return false;
    }

    const [
      openHour,
      openMinute
    ] =
      form.openTime
        .split(':')
        .map(Number);

    const [
      closeHour,
      closeMinute
    ] =
      form.closeTime
        .split(':')
        .map(Number);

    const open =
      openHour * 60 +
      openMinute;

    const close =
      closeHour * 60 +
      closeMinute;

    return (
      Number.isFinite(open) &&
      Number.isFinite(close) &&
      close > open
    );
  }

  private getEmptyForm():
    SpaceFormData {
    return {
      title: '',
      address: '',
      district: 'Miraflores',
      price: 5,
      type: 'cubierto',
      totalSpots: 1,
      description: '',
      openTime: '08:00',
      closeTime: '20:00'
    };
  }
}