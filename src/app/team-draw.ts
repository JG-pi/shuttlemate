import { AppBooking } from './firebase';

export interface RandomTeam {
  id: string;
  name: string;
  players: AppBooking[];
}

export interface RandomMatch {
  id: string;
  label: string;
  teamA: RandomTeam;
  teamB?: RandomTeam;
}

export interface TeamDraw {
  eventId: string;
  teams: RandomTeam[];
  matches: RandomMatch[];
  standby?: AppBooking;
  generatedAt: Date;
}

export function createRandomTeamDraw(eventId: string, participants: AppBooking[]): TeamDraw {
  const shuffled = shuffleParticipants(participants);
  const standby = shuffled.length % 2 === 1 ? shuffled.pop() : undefined;
  const generatedAt = new Date();
  const seed = `${eventId}_${generatedAt.getTime()}`;
  const teams: RandomTeam[] = [];

  for (let index = 0; index < shuffled.length; index += 2) {
    const teamNumber = teams.length + 1;
    teams.push({
      id: `${seed}_team_${teamNumber}`,
      name: `Team ${teamNumber}`,
      players: [shuffled[index], shuffled[index + 1]]
    });
  }

  const matches: RandomMatch[] = [];
  for (let index = 0; index < teams.length; index += 2) {
    const matchNumber = matches.length + 1;
    matches.push({
      id: `${seed}_match_${matchNumber}`,
      label: `Match ${matchNumber}`,
      teamA: teams[index],
      teamB: teams[index + 1]
    });
  }

  return {
    eventId,
    teams,
    matches,
    standby,
    generatedAt
  };
}

function shuffleParticipants(participants: AppBooking[]): AppBooking[] {
  const shuffled = [...participants];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function randomInt(maxExclusive: number): number {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    return Math.floor(Math.random() * maxExclusive);
  }

  const range = 0x100000000;
  const limit = Math.floor(range / maxExclusive) * maxExclusive;
  const values = new Uint32Array(1);

  do {
    cryptoApi.getRandomValues(values);
  } while (values[0] >= limit);

  return values[0] % maxExclusive;
}
