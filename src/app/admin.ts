import { ChangeDetectionStrategy, Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormGroup, FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subscription, combineLatest } from 'rxjs';
import { FirebaseService, AppEvent, AppBooking, AppLocation, AppRuntimeError, isUserAdmin } from './firebase';
import { MarkdownPipe } from './markdown';
import { TeamDraw, createRandomTeamDraw } from './team-draw';

export interface AdminEventViewModel extends AppEvent {
  participants: AppBooking[];
  costPerParticipant: number;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin',
  imports: [CommonModule, RouterLink, ReactiveFormsModule, MatIconModule, MarkdownPipe],
  templateUrl: './admin.html',
  host: {
    class: 'block min-h-screen bg-neutral-50'
  }
})
export class Admin implements OnInit, OnDestroy {
  firebaseService = inject(FirebaseService);
  private router = inject(Router);

  // Streams & States
  private authSubscription?: Subscription;
  private dataSubscription?: Subscription;
  private locationsSubscription?: Subscription;
  private runtimeErrorsSubscription?: Subscription;
  private eventFormSubscription?: Subscription;
  eventList = signal<AdminEventViewModel[]>([]);
  locationList = signal<AppLocation[]>([]);
  runtimeErrorList = signal<AppRuntimeError[]>([]);
  selectedEventId = signal<string | null>(null);
  loading = signal<boolean>(true);
  submitting = signal<boolean>(false);
  savingLocation = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  pendingDeleteLocationId = signal<string | null>(null);
  pendingFinaliseEventId = signal<string | null>(null);
  pendingPaymentBookingId = signal<string | null>(null);
  pendingRemoveBookingId = signal<string | null>(null);
  spinningTeamsForEventId = signal<string | null>(null);
  teamDraw = signal<TeamDraw | null>(null);
  editingEventId = signal<string | null>(null);

  // Authenticated User Stats
  isLoggedIn = signal<boolean>(false);
  isAdminUser = signal<boolean>(false);
  currentUserEmail = signal<string | null>(null);

  // Reactive Event Builder Form
  eventForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(128)]
    }),
    location: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(256)]
    }),
    locationId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    courtCount: new FormControl<number>(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)]
    }),
    durationHours: new FormControl<number>(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0.25)]
    }),
    date: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    capacity: new FormControl<number>(10, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)]
    }),
    cost: new FormControl<number>(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)]
    }),
    additionalInfo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(10000)]
    })
  });

  locationForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(128)]
    }),
    pricePerCourtHour: new FormControl<number>(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)]
    })
  });

  // Fetch reactive values for previewing Markdown
  get additionalInfoPreview(): string {
    return this.eventForm.controls.additionalInfo.value || '';
  }

  get eventFormTitle(): string {
    return this.editingEventId() ? 'Edit Event Details' : 'Schedule New Event';
  }

  get eventFormDescription(): string {
    return this.editingEventId() ? 'Update the selected event details' : 'Add an event to the public list';
  }

  get calculatedCostPreview(): number {
    return this.eventForm.controls.cost.value || 0;
  }

  ngOnInit(): void {
    this.authSubscription = combineLatest([
      this.firebaseService.user$,
      this.firebaseService.authReady$
    ]).subscribe(([user, authReady]) => {
      if (!authReady) return;

      if (!user) {
        this.isLoggedIn.set(false);
        this.isAdminUser.set(false);
        this.loading.set(false);
        this.router.navigate(['/login']);
        return;
      }

      this.isLoggedIn.set(true);
      this.currentUserEmail.set(user.email);
      const adminClaim = isUserAdmin(user.email);
      this.isAdminUser.set(adminClaim);

      if (!this.eventFormSubscription) {
        this.eventFormSubscription = this.eventForm.valueChanges.subscribe(() => {
          this.syncCostCalculator();
        });
      }

      if (!adminClaim) {
        this.loading.set(false);
        if (this.dataSubscription) {
          this.dataSubscription.unsubscribe();
        }
        if (this.locationsSubscription) {
          this.locationsSubscription.unsubscribe();
          this.locationsSubscription = undefined;
        }
        if (this.runtimeErrorsSubscription) {
          this.runtimeErrorsSubscription.unsubscribe();
          this.runtimeErrorsSubscription = undefined;
        }
        return;
      }

      this.startAdminDataSubscription();
      this.startLocationSubscription();
      this.startRuntimeErrorsSubscription();
    });
  }

  private startAdminDataSubscription(): void {
    if (this.dataSubscription) {
      this.dataSubscription.unsubscribe();
    }

    this.loading.set(true);

    // Real-Time Combined Stream of Events and all Booking participant lists
    this.dataSubscription = combineLatest([
      this.firebaseService.selectEvents(),
      this.firebaseService.selectAllBookings()
    ]).subscribe({
      next: ([events, bookings]) => {
        const vms: AdminEventViewModel[] = events.map(e => {
          const eventBookings = bookings.filter(b => b.eventId === e.id);
          const participantCount = eventBookings.length;
          const costPerParticipant = participantCount > 0 ? e.cost / participantCount : e.cost;

          return {
            ...e,
            participants: eventBookings,
            costPerParticipant
          };
        });

        this.eventList.set(vms);
        
        // If no event is selected but we have events, default-select the first one to keep dashboard rich
        if (!this.selectedEventId() && vms.length > 0) {
          this.selectedEventId.set(vms[0].id);
        }

        this.loading.set(false);
      },
      error: (e) => {
        console.error('Permission error or reading problem in Admin console', e);
        this.errorMessage.set(this.getWriteErrorMessage(e, 'Permission denied or lost connection.'));
        this.loading.set(false);
      }
    });
  }

  private startLocationSubscription(): void {
    if (this.locationsSubscription) {
      return;
    }

    this.locationsSubscription = this.firebaseService.selectLocations().subscribe({
      next: (locations) => {
        this.locationList.set(locations);
        this.syncCostCalculator();
      },
      error: (e) => {
        console.error('Could not load admin location settings', e);
        this.errorMessage.set(this.getWriteErrorMessage(e, 'Could not load location settings.'));
      }
    });
  }

  private startRuntimeErrorsSubscription(): void {
    if (this.runtimeErrorsSubscription) {
      return;
    }

    this.runtimeErrorsSubscription = this.firebaseService.selectRuntimeErrors().subscribe({
      next: (runtimeErrors) => {
        this.runtimeErrorList.set(runtimeErrors);
      },
      error: (e) => {
        console.error('Could not load runtime error logs', e);
        this.errorMessage.set(this.getWriteErrorMessage(e, 'Could not load runtime error logs.'));
      }
    });
  }

  ngOnDestroy(): void {
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
    if (this.dataSubscription) {
      this.dataSubscription.unsubscribe();
    }
    if (this.locationsSubscription) {
      this.locationsSubscription.unsubscribe();
    }
    if (this.runtimeErrorsSubscription) {
      this.runtimeErrorsSubscription.unsubscribe();
    }
    if (this.eventFormSubscription) {
      this.eventFormSubscription.unsubscribe();
    }
  }

  isFieldInvalid(fieldName: keyof typeof this.eventForm.controls): boolean {
    const control = this.eventForm.controls[fieldName];
    return control.invalid && (control.touched || control.dirty);
  }

  getFieldError(fieldName: keyof typeof this.eventForm.controls): string | null {
    const control = this.eventForm.controls[fieldName];
    if (!this.isFieldInvalid(fieldName)) return null;
    if (control.hasError('required')) return 'This field is required.';
    if (control.hasError('maxlength')) return 'This field is too long.';
    if (control.hasError('min')) return 'Use a value above the minimum.';
    return 'Please check this field.';
  }

  // Set chosen event for participant management view
  selectEvent(eventId: string): void {
    this.selectedEventId.set(eventId);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    if (this.teamDraw()?.eventId !== eventId) {
      this.teamDraw.set(null);
    }
  }

  // Get currently selected event view model
  getSelectedEvent(): AdminEventViewModel | undefined {
    return this.eventList().find(e => e.id === this.selectedEventId());
  }

  formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  }

  getSelectedRateLocation(): AppLocation | undefined {
    const locationId = this.eventForm.controls.locationId.value;
    return this.locationList().find(location => location.id === locationId);
  }

  private syncCostCalculator(): void {
    const selectedLocation = this.getSelectedRateLocation();
    if (!selectedLocation) return;

    const courtCount = Number(this.eventForm.controls.courtCount.value) || 0;
    const durationHours = Number(this.eventForm.controls.durationHours.value) || 0;
    const totalCost = this.roundCurrency(selectedLocation.pricePerCourtHour * courtCount * durationHours);

    this.eventForm.controls.location.setValue(selectedLocation.name, { emitEvent: false });
    this.eventForm.controls.cost.setValue(totalCost, { emitEvent: false });
  }

  private roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }

  async handleEventFormSubmit(): Promise<void> {
    if (this.editingEventId()) {
      await this.onUpdateEvent();
      return;
    }

    await this.onCreateEvent();
  }

  async onCreateEvent(): Promise<void> {
    if (this.eventForm.invalid) {
      this.eventForm.markAllAsTouched();
      this.errorMessage.set('Please fill out all event fields correctly before submitting.');
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const payload = this.getEventFormPayload();
    if (!payload) return;

    try {
      await this.firebaseService.createEvent(
        payload.name,
        payload.date,
        payload.capacity,
        payload.location,
        payload.additionalInfo,
        payload.cost
      );
      
      this.successMessage.set(`Successfully scheduled event "${payload.name}"!`);
      this.resetEventForm();
    } catch (e) {
      console.error('Error scheduling event', e);
      this.errorMessage.set(this.getWriteErrorMessage(e, 'Could not write event record to database.'));
    } finally {
      this.submitting.set(false);
    }
  }

  startEditEvent(event: AdminEventViewModel): void {
    const matchedLocation = this.locationList().find(location => location.name === event.location);
    const inferredDuration = matchedLocation && matchedLocation.pricePerCourtHour > 0
      ? this.roundCurrency(event.cost / matchedLocation.pricePerCourtHour)
      : 1;

    this.editingEventId.set(event.id);
    this.selectedEventId.set(event.id);
    this.successMessage.set(null);
    this.errorMessage.set(null);
    this.eventForm.reset({
      name: event.name,
      location: event.location,
      locationId: matchedLocation?.id || '',
      courtCount: 1,
      durationHours: inferredDuration,
      date: this.toDateTimeLocalInputValue(event.date),
      capacity: event.capacity,
      cost: event.cost,
      additionalInfo: event.additionalInfo
    }, { emitEvent: false });

    this.syncCostCalculator();

    window.setTimeout(() => {
      document.getElementById('event-builder-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  cancelEditEvent(): void {
    this.editingEventId.set(null);
    this.errorMessage.set(null);
    this.resetEventForm();
  }

  private async onUpdateEvent(): Promise<void> {
    if (this.eventForm.invalid) {
      this.eventForm.markAllAsTouched();
      this.errorMessage.set('Please fill out all event fields correctly before saving changes.');
      return;
    }

    const eventId = this.editingEventId();
    if (!eventId) return;

    const selectedEvent = this.eventList().find(event => event.id === eventId);
    if (!selectedEvent) {
      this.errorMessage.set('The event being edited could not be found.');
      return;
    }

    const payload = this.getEventFormPayload();
    if (!payload) return;

    if (payload.capacity < selectedEvent.participants.length) {
      this.errorMessage.set(`Capacity cannot be lower than the ${selectedEvent.participants.length} players already booked.`);
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    try {
      await this.firebaseService.updateEvent(eventId, {
        name: payload.name,
        date: payload.date,
        capacity: payload.capacity,
        location: payload.location,
        additionalInfo: payload.additionalInfo,
        cost: payload.cost
      });

      this.successMessage.set(`Updated event "${payload.name}".`);
      this.editingEventId.set(null);
      this.resetEventForm();
    } catch (e) {
      console.error('Error updating event', e);
      this.errorMessage.set(this.getWriteErrorMessage(e, 'Could not update event details.'));
    } finally {
      this.submitting.set(false);
    }
  }

  private resetEventForm(): void {
    this.eventForm.reset({
      name: '',
      location: '',
      locationId: '',
      courtCount: 1,
      durationHours: 1,
      date: '',
      capacity: 10,
      cost: 0,
      additionalInfo: ''
    });
  }

  private getEventFormPayload(): {
    name: string;
    date: string;
    capacity: number;
    location: string;
    additionalInfo: string;
    cost: number;
  } | null {
    const selectedLocation = this.getSelectedRateLocation();
    if (!selectedLocation) {
      this.submitting.set(false);
      this.errorMessage.set('Select a saved location before scheduling this event.');
      return null;
    }

    this.syncCostCalculator();
    const { name, date, capacity, additionalInfo, cost } = this.eventForm.getRawValue();

    return {
      name,
      date,
      capacity,
      location: selectedLocation.name,
      additionalInfo,
      cost
    };
  }

  private toDateTimeLocalInputValue(dateValue: string): string {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dateValue)) {
      return dateValue.slice(0, 16);
    }

    const parsedDate = new Date(dateValue);
    if (Number.isNaN(parsedDate.getTime())) {
      return dateValue;
    }

    const timezoneOffset = parsedDate.getTimezoneOffset() * 60000;
    return new Date(parsedDate.getTime() - timezoneOffset).toISOString().slice(0, 16);
  }

  formatRuntimeErrorDate(error: AppRuntimeError): string {
    const date = error.createdAt?.toDate?.();
    if (!date) return 'Pending timestamp';

    return date.toLocaleString('en-AU', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  getRuntimeErrorSummary(error: AppRuntimeError): string {
    return `${error.stage}: ${error.message}`;
  }

  private getWriteErrorMessage(error: unknown, fallback: string): string {
    const err = error as { code?: string; message?: string };
    const details = err.message || err.code;
    return details ? `${fallback} ${details}` : fallback;
  }

  async handleCreateLocation(): Promise<void> {
    if (this.locationForm.invalid) {
      this.locationForm.markAllAsTouched();
      this.errorMessage.set('Enter a location name and price per court hour.');
      return;
    }

    const { name, pricePerCourtHour } = this.locationForm.getRawValue();
    const trimmedName = name.trim();
    if (!trimmedName) {
      this.errorMessage.set('Enter a location name.');
      return;
    }

    this.savingLocation.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    try {
      await this.firebaseService.createLocation(trimmedName, Number(pricePerCourtHour));
      this.successMessage.set(`Saved location "${trimmedName}".`);
      this.locationForm.reset({
        name: '',
        pricePerCourtHour: 0
      });
    } catch (e) {
      console.error('Error saving location', e);
      this.errorMessage.set(this.getWriteErrorMessage(e, 'Could not save location.'));
    } finally {
      this.savingLocation.set(false);
    }
  }

  async handleDeleteLocation(location: AppLocation): Promise<void> {
    const confirmDelete = confirm(`Remove ${location.name} from saved locations? Existing events will keep their public location and total cost.`);
    if (!confirmDelete) return;

    this.pendingDeleteLocationId.set(location.id);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    try {
      await this.firebaseService.deleteLocation(location.id);
      if (this.eventForm.controls.locationId.value === location.id) {
        this.eventForm.controls.locationId.setValue('');
      }
      this.successMessage.set(`Removed location "${location.name}".`);
    } catch (e) {
      console.error('Error deleting location', e);
      this.errorMessage.set(this.getWriteErrorMessage(e, 'Could not delete location.'));
    } finally {
      this.pendingDeleteLocationId.set(null);
    }
  }

  async handleToggleFinalise(event: AdminEventViewModel): Promise<void> {
    try {
      this.pendingFinaliseEventId.set(event.id);
      const lockState = !event.finalised;
      await this.firebaseService.updateEvent(event.id, { finalised: lockState });
      this.successMessage.set(`Event bookings ${lockState ? 'finalised and locked' : 'unlocked'}.`);
    } catch (e) {
      console.error('Error toggling finalised state', e);
      this.errorMessage.set(this.getWriteErrorMessage(e, 'Could not modify event booking state.'));
    } finally {
      this.pendingFinaliseEventId.set(null);
    }
  }

  async handleRemoveParticipant(eventId: string, userId: string, userName: string): Promise<void> {
    const confirmDelete = confirm(`Are you sure you want to remove ${userName} from this event?`);
    if (!confirmDelete) return;

    try {
      this.pendingRemoveBookingId.set(`${eventId}_${userId}`);
      await this.firebaseService.removeBooking(eventId, userId);
      this.successMessage.set(`Removed ${userName} from registration.`);
    } catch (e) {
      console.error('Error removing participant', e);
      this.errorMessage.set(this.getWriteErrorMessage(e, 'Failed to remove participant.'));
    } finally {
      this.pendingRemoveBookingId.set(null);
    }
  }

  async handleTogglePayment(booking: AppBooking): Promise<void> {
    try {
      this.pendingPaymentBookingId.set(booking.id);
      const toggle = !booking.paid;
      await this.firebaseService.updateBookingPayment(booking.eventId, booking.userId, toggle);
      this.successMessage.set(`Payment state updated for ${booking.userName}.`);
    } catch (e) {
      console.error('Error updating booking payment', e);
      this.errorMessage.set(this.getWriteErrorMessage(e, 'Failed to update payment state.'));
    } finally {
      this.pendingPaymentBookingId.set(null);
    }
  }

  async handleSpinTeams(event: AdminEventViewModel): Promise<void> {
    if (event.participants.length < 2) {
      this.errorMessage.set('At least 2 booked players are needed to create a random team draw.');
      return;
    }

    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.teamDraw.set(null);
    this.spinningTeamsForEventId.set(event.id);

    try {
      await this.waitForSpin();
      const draw = createRandomTeamDraw(event.id, event.participants);
      this.teamDraw.set(draw);
      this.successMessage.set(`Randomised ${draw.teams.length} teams for ${event.name}.`);
    } finally {
      this.spinningTeamsForEventId.set(null);
    }
  }

  clearTeamDraw(): void {
    this.teamDraw.set(null);
  }

  private waitForSpin(): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, 900));
  }

  async handleForceLogout(): Promise<void> {
    try {
      await this.firebaseService.logOut();
      this.router.navigate(['/login']);
    } catch (e) {
      console.error('Logout failed', e);
    }
  }
}
