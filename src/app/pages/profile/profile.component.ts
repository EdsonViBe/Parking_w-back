import {
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  Router,
  RouterLink
} from '@angular/router';

import {
  Subject,
  takeUntil
} from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { User } from '../../models/parking.model';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink
  ],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent
  implements OnInit, OnDestroy {

  currentUser: User | null = null;

  editMode = false;
  loading = false;
  saving = false;

  name = '';
  phone = '';

  successMessage = '';
  errorMessage = '';

  private readonly destroy$ =
    new Subject<void>();

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.authService
      .getCurrentUser()
      .pipe(
        takeUntil(this.destroy$)
      )
      .subscribe(user => {
        this.currentUser = user;

        if (user && !this.editMode) {
          this.name = user.name;
          this.phone = user.phone ?? '';
        }
      });

    this.loadProfile();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get roleLabel(): string {
    return this.currentUser?.role ===
      'propietario'
        ? 'Propietario'
        : 'Conductor';
  }

  get nextRoleLabel(): string {
    return this.currentUser?.role ===
      'propietario'
        ? 'Conductor'
        : 'Propietario';
  }

  loadProfile(): void {
    this.loading = true;
    this.errorMessage = '';

    this.authService
      .refreshProfile()
      .subscribe({
        next: user => {
          this.loading = false;

          if (!user) {
            this.errorMessage =
              'No se pudo cargar el perfil';
            return;
          }

          this.name = user.name;
          this.phone = user.phone ?? '';
        },

        error: () => {
          this.loading = false;
          this.errorMessage =
            'No se pudo cargar el perfil';
        }
      });
  }

  startEditing(): void {
    if (!this.currentUser) {
      return;
    }

    this.name = this.currentUser.name;
    this.phone =
      this.currentUser.phone ?? '';

    this.successMessage = '';
    this.errorMessage = '';
    this.editMode = true;
  }

  cancelEditing(): void {
    this.editMode = false;
    this.successMessage = '';
    this.errorMessage = '';

    if (this.currentUser) {
      this.name = this.currentUser.name;
      this.phone =
        this.currentUser.phone ?? '';
    }
  }

  saveProfile(): void {
    this.successMessage = '';
    this.errorMessage = '';

    const normalizedName =
      this.name.trim();

    if (!normalizedName) {
      this.errorMessage =
        'El nombre es obligatorio';
      return;
    }

    this.saving = true;

    this.authService
      .updateProfile({
        name: normalizedName,
        phone: this.phone
      })
      .subscribe(result => {
        this.saving = false;

        if (!result.success) {
          this.errorMessage =
            result.error ??
            'No se pudo actualizar el perfil';
          return;
        }

        this.editMode = false;
        this.successMessage =
          'Perfil actualizado correctamente';
      });
  }

  switchRole(): void {
    this.authService.switchRole();

    const updatedUser =
      this.authService.getCurrentUserValue();

    if (
      updatedUser?.role === 'propietario'
    ) {
      this.router.navigate([
        '/dashboard-propietario'
      ]);

      return;
    }

    this.router.navigate(['/']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}