export type Screen = 
  | 'home' 
  | 'session-intentions' 
  | 'pre-cycle' 
  | 'timer' 
  | 'cycle-reflection' 
  | 'break' 
  | 'break-complete'
  | 'session-review' 
  | 'session-overview'
  | 'session-spreadsheet'
  | 'history';

export type TimerStatus = 'idle' | 'running' | 'paused' | 'completed';

export type EnergyLevel = 'High' | 'Medium' | 'Low';
export type MoraleLevel = 'High' | 'Medium' | 'Low';
export type CycleStatus = 'hit' | 'miss' | 'partial';

export interface SessionIntentions {
  objective: string;
  importance: string;
  definitionOfDone: string;
  hazards: string;
  concrete: boolean;
  workMinutes: number;
  breakMinutes: number;
  cyclesPlanned: number;
}

export interface CycleData {
  id: string;
  sessionId: string;
  idx: number;
  goal: string;
  firstStep: string;
  hazards: string;
  energy: EnergyLevel;
  morale: MoraleLevel;
  status?: CycleStatus;
  noteworthy: string;
  distractions: string;
  improvement: string;
  startedAt?: Date;
  endedAt?: Date;
}

export interface Session {
  id: string;
  startedAt: Date;
  intentions: SessionIntentions;
  cycles: CycleData[];
  completed: boolean;
  currentCycleIdx: number;
}

export interface VoiceNote {
  id: string;
  sessionId: string;
  cycleIdx: number;
  kind: 'work' | 'distraction';
  timestamp: Date;
  text: string;
}