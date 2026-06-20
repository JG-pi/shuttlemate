import { ChangeDetectionStrategy, Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Subscription, combineLatest } from 'rxjs';
import { User } from 'firebase/auth';
import { FirebaseService, AppEvent, AppBooking, isUserAdmin } from './firebase';
import { MarkdownPipe } from './markdown';
import { TeamDraw, createRandomTeamDraw } from './team-draw';
import { formatEventDateTimeRange } from './event-time';

export interface EventViewModel extends AppEvent {
  participants: AppBooking[];
  participantCount: number;
  costPerParticipant: number;
  courtCostTotal: number;
  shuttlecockCostTotal: number;
  isCurrentUserSignedUp: boolean;
  currentUserBooking?: AppBooking;
  isFull: boolean;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dashboard',
  imports: [CommonModule, RouterLink, MatIconModule, MarkdownPipe],
  templateUrl: './dashboard.html',
  host: {
    class: 'block min-h-screen bg-neutral-50'
  }
})
export class Dashboard implements OnInit, OnDestroy {
  firebaseService = inject(FirebaseService);
  private router = inject(Router);

  // States
  authSubscription?: Subscription;
  eventsAndBookingsSub?: Subscription;
  eventList = signal<EventViewModel[]>([]);
  myBookings = signal<AppBooking[]>([]);
  loading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);
  pendingEventId = signal<string | null>(null);
  pendingAction = signal<'join' | 'cancel' | null>(null);
  spinningTeamsForEventId = signal<string | null>(null);
  teamDraws = signal<Record<string, TeamDraw>>({});

  // User Signal state
  currentUserEmail = signal<string | null>(null);
  currentUserName = signal<string | null>(null);
  isAdminUser = signal<boolean>(false);

  ngOnInit(): void {
    this.authSubscription = combineLatest([
      this.firebaseService.user$,
      this.firebaseService.authReady$
    ]).subscribe(([user, authReady]) => {
      if (!authReady) return;
      if (!this.firebaseService.isBrowser) return;

      if (!user) {
        this.loading.set(false);
        this.router.navigate(['/login']);
        return;
      }

      this.currentUserEmail.set(user.email);
      this.currentUserName.set(user.displayName || 'Guest User');
      this.isAdminUser.set(isUserAdmin(user.email));
      this.startDashboardSubscription(user);
    });
  }

  private startDashboardSubscription(user: User): void {
    if (this.eventsAndBookingsSub) {
      this.eventsAndBookingsSub.unsubscribe();
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    this.eventsAndBookingsSub = combineLatest([
      this.firebaseService.selectEvents(),
      this.firebaseService.selectAllBookings()
    ]).subscribe({
      next: ([events, bookings]) => {
        // Build individual event view models
        const viewModels: EventViewModel[] = events.map(e => {
          const eventBookings = bookings
            .filter(b => b.eventId === e.id)
            .sort((a, b) => a.userName.localeCompare(b.userName, undefined, { sensitivity: 'base' }));
          const participantCount = eventBookings.length;
          
          // Cost split calculation: split equally by number of participants (minimum 1, or show shared logic if 0)
          const divisor = participantCount > 0 ? participantCount : 1;
          const costPerParticipant = e.cost / divisor;
          const courtCostTotal = typeof e.courtCost === 'number' ? e.courtCost : e.cost;
          const shuttlecockCostTotal = typeof e.shuttlecockCost === 'number' ? e.shuttlecockCost : 0;

          const currentUserBooking = eventBookings.find(b => b.userId === user.uid);
          const isCurrentUserSignedUp = !!currentUserBooking;
          const isFull = participantCount >= e.capacity;

          return {
            ...e,
            participants: eventBookings,
            participantCount,
            costPerParticipant,
            courtCostTotal,
            shuttlecockCostTotal,
            isCurrentUserSignedUp,
            currentUserBooking,
            isFull
          };
        });

        this.eventList.set(viewModels);
        
        // Filter current user's general bookings
        this.myBookings.set(bookings.filter(b => b.userId === user.uid));
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error combining dashboard states', err);
        const message = err?.message || err?.code || 'Please check database permissions.';
        this.errorMessage.set(`Could not fetch events or registrations. ${message}`);
        this.loading.set(false);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
    if (this.eventsAndBookingsSub) {
      this.eventsAndBookingsSub.unsubscribe();
    }
  }

  formatEventTimeRange(event: AppEvent): string {
    return formatEventDateTimeRange(event);
  }

  async handleJoinEvent(eventVm: EventViewModel): Promise<void> {
    if (eventVm.finalised) {
      this.errorMessage.set('This event booking is finalised and locked.');
      return;
    }
    if (eventVm.isFull && !eventVm.isCurrentUserSignedUp) {
      this.errorMessage.set('Event is already full!');
      return;
    }

    try {
      this.pendingEventId.set(eventVm.id);
      this.pendingAction.set('join');
      const name = this.currentUserName() || 'Participant';
      await this.firebaseService.addBooking(eventVm.id, name);
      this.errorMessage.set(null);
    } catch (e) {
      console.error('Could not join event', e);
      this.errorMessage.set(this.getBookingErrorMessage(e, 'Failed to sign up for event.'));
    } finally {
      this.pendingEventId.set(null);
      this.pendingAction.set(null);
    }
  }

  async handleCancelSignup(eventVm: EventViewModel): Promise<void> {
    if (eventVm.finalised) {
      this.errorMessage.set('This event is finalised and bookings cannot be canceled.');
      return;
    }

    const uid = this.firebaseService.auth.currentUser?.uid;
    if (!uid) return;

    try {
      this.pendingEventId.set(eventVm.id);
      this.pendingAction.set('cancel');
      await this.firebaseService.removeBooking(eventVm.id, uid);
      this.errorMessage.set(null);
    } catch (e) {
      console.error('Could not leave event', e);
      this.errorMessage.set(this.getBookingErrorMessage(e, 'Failed to cancel signup.'));
    } finally {
      this.pendingEventId.set(null);
      this.pendingAction.set(null);
    }
  }

  async handleSpinTeams(eventVm: EventViewModel): Promise<void> {
    if (eventVm.participants.length < 2) {
      this.errorMessage.set('At least 2 booked players are needed to create random teams.');
      return;
    }

    this.errorMessage.set(null);
    this.spinningTeamsForEventId.set(eventVm.id);
    this.teamDraws.update(draws => {
      const updated = { ...draws };
      delete updated[eventVm.id];
      return updated;
    });

    try {
      await this.waitForSpin();
      const draw = createRandomTeamDraw(eventVm.id, eventVm.participants);
      this.teamDraws.update(draws => ({ ...draws, [eventVm.id]: draw }));
    } finally {
      this.spinningTeamsForEventId.set(null);
    }
  }

  private waitForSpin(): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, 900));
  }

  private getBookingErrorMessage(error: unknown, fallback: string): string {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('Missing or insufficient permissions')) {
      return `${fallback} Your account is signed in, but the database rules rejected this booking.`;
    }

    if (message.includes('timed out')) {
      return `${fallback} The request timed out. Please check your connection and try again.`;
    }

    return `${fallback} Please try again.`;
  }

  async handleLogout(): Promise<void> {
    try {
      await this.firebaseService.logOut();
      this.router.navigate(['/login']);
    } catch (e) {
      console.error('Logout failed', e);
    }
  }
}
