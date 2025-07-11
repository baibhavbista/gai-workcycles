import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Screen, Session, CycleData, SessionIntentions, VoiceNote, TimerStatus } from '../types';
import type { Settings } from '../types';

// Electron IPC helpers (will be undefined in web build)
import { isElectron, createSession as ipcCreateSession, startCycle as ipcStartCycle, finishCycle as ipcFinishCycle, getSettings as ipcGetSettings, saveSettings as ipcSaveSettings, updateTray as ipcUpdateTray } from '../electron-ipc';

interface WorkCyclesState {
  // Navigation
  currentScreen: Screen;
  navStack: Screen[];
  setScreen: (screen: Screen) => void;
  navigate: (screen: Screen) => void;
  goBack: () => void;
  
  // Current session
  currentSession: Session | null;
  currentCycle: CycleData | null;
  setCurrentSession: (session: Session) => void;
  
  // Timer
  timerStatus: TimerStatus;
  timeRemaining: number; // in seconds
  
  // History
  sessions: Session[];
  
  // Actions
  startNewSession: (intentions: SessionIntentions) => void;
  startCycle: (cycleData: Omit<CycleData, 'id' | 'sessionId' | 'idx'>) => void;
  completeCycle: (reflection: Partial<CycleData>) => void;
  completeSession: () => void;
  
  // Timer actions
  startTimer: () => void;
  pauseTimer: () => void;
  finishEarly: () => void;
  tick: () => void;
  
  // Voice notes (placeholder)
  voiceNotes: VoiceNote[];
  addVoiceNote: (note: Omit<VoiceNote, 'id'>) => void;
  
  // App settings
  settings: Settings | null;
  
  // Settings handlers
  loadSettings: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
}

const generateId = () => Math.random().toString(36).substring(2) + Date.now().toString(36);

// simple chime using Web Audio API (500ms sine beep)
function playChime() {
  try {
    const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 500);
  } catch {
    // ignore audio failures
  }
}

// Helper function to recursively convert date strings back to Date objects
const reviveDates = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(reviveDates);
  }
  
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if ((key === 'startedAt' || key === 'endedAt' || key === 'timestamp') && typeof value === 'string') {
      const date = new Date(value);
      result[key] = isNaN(date.getTime()) ? value : date;
    } else if (typeof value === 'object' && value !== null) {
      result[key] = reviveDates(value);
    } else {
      result[key] = value;
    }
  }
  
  return result;
};

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export const useWorkCyclesStore = create<WorkCyclesState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentScreen: 'home',
      navStack: [],
      currentSession: null,
      currentCycle: null,
      timerStatus: 'idle',
      timeRemaining: 0,
      sessions: [],
      voiceNotes: [],
      settings: null,
      
      // Navigation
      setScreen: (screen) => set({ currentScreen: screen }),
      navigate: (screen) => set((state) => ({
        navStack: [...state.navStack, state.currentScreen],
        currentScreen: screen,
      })),
      goBack: () => set((state) => {
        const stack = [...state.navStack];
        const prev = stack.pop();
        return {
          navStack: stack,
          currentScreen: prev ?? 'home',
        };
      }),
      setCurrentSession: (session) => set({ currentSession: session }),
      
      // Session management
      startNewSession: async (intentions) => {
        let sessionId: string;

        if (isElectron()) {
          // Map camelCase to snake_case expected by IPC
          sessionId = await ipcCreateSession({
            work_minutes: intentions.workMinutes,
            break_minutes: intentions.breakMinutes,
            cycles_planned: intentions.cyclesPlanned,
            objective: intentions.objective,
            importance: intentions.importance,
            definition_of_done: intentions.definitionOfDone,
            hazards: intentions.hazards,
            misc_notes: intentions.miscNotes,
            concrete: intentions.concrete,
          });
        } else {
          sessionId = generateId();
        }

        const session: Session = {
          id: sessionId,
          startedAt: new Date(),
          intentions,
          cycles: [],
          completed: false,
          currentCycleIdx: 0,
        };
        set({ 
          currentSession: session,
          currentScreen: 'pre-cycle'
        });
      },
      
      startCycle: async (cycleData) => {
        const { currentSession } = get();
        if (!currentSession) return;
        
        let cycleId: string;
        if (isElectron()) {
          cycleId = await ipcStartCycle({
            sessionId: currentSession.id,
            idx: currentSession.currentCycleIdx,
            goal: cycleData.goal,
            first_step: cycleData.firstStep,
            hazards: cycleData.hazards,
            energy: cycleData.energy,
            morale: cycleData.morale,
          });
        } else {
          cycleId = generateId();
        }

        const cycle: CycleData = {
          ...cycleData,
          id: cycleId,
          sessionId: currentSession.id,
          idx: currentSession.currentCycleIdx,
          startedAt: new Date(),
        };
        
        set({ 
          currentCycle: cycle,
          timeRemaining: currentSession.intentions.workMinutes * 60,
          timerStatus: 'idle',
          currentScreen: 'timer'
        });
      },
      
      completeCycle: async (reflection) => {
        const { currentSession, currentCycle } = get();
        if (!currentSession || !currentCycle) return;
        
        const completedCycle: CycleData = {
          ...currentCycle,
          ...reflection,
          endedAt: new Date(),
        };
        
        const updatedCycles = [...currentSession.cycles, completedCycle];
        const updatedSession = {
          ...currentSession,
          cycles: updatedCycles,
          currentCycleIdx: currentSession.currentCycleIdx + 1,
        };

        // Persist via IPC
        if (isElectron()) {
          await ipcFinishCycle({
            cycleId: currentCycle.id,
            status: reflection.status ?? 'partial',
            noteworthy: reflection.noteworthy ?? '',
            distractions: reflection.distractions ?? '',
            improvement: reflection.improvement ?? '',
            shouldCompleteSession: updatedSession.currentCycleIdx >= updatedSession.intentions.cyclesPlanned,
            sessionId: currentSession.id,
          });
        }
        
        set({ 
          currentSession: updatedSession,
          currentCycle: null,
        });
        
        // // Check if this was the last cycle
        // if (updatedSession.currentCycleIdx >= updatedSession.intentions.cyclesPlanned) {
        //   set({ currentScreen: 'session-review' });
        // } else {
        //   set({ currentScreen: 'break' });
        // }
      },
      
      completeSession: () => {
        const { currentSession, sessions } = get();
        if (!currentSession) return;
        
        const completedSession = {
          ...currentSession,
          completed: true,
        };
        
        set({
          sessions: [...sessions, completedSession],
          currentSession: completedSession,
          currentCycle: null,
          currentScreen: 'session-overview',
        });
      },
      
      // Timer actions
      startTimer: () => {
        set({ timerStatus: 'running' });
      },
      
      pauseTimer: () => {
        const { timerStatus } = get();
        set({ 
          timerStatus: timerStatus === 'running' ? 'paused' : 'running' 
        });
      },
      
      finishEarly: () => {
        const { settings } = get();
        // feedback per settings
        if (settings?.chimeEnabled) playChime();
        if (settings?.notifyEnabled && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            new Notification('Cycle finished early');
          } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then((p) => {
              if (p === 'granted') new Notification('Cycle finished early');
            });
          }
        }

        set({ 
          timerStatus: 'completed',
          timeRemaining: 0,
          currentScreen: 'cycle-reflection'
        });

        if (isElectron()) {
          ipcUpdateTray('');
        }
      },
      
      tick: () => {
        const { timerStatus, timeRemaining } = get();
        if (timerStatus !== 'running') {
          if (isElectron()) ipcUpdateTray('');
          return;
        }
        
        if (timeRemaining <= 1) {
          const { settings } = get();
          if (settings?.chimeEnabled) playChime();
          if (settings?.notifyEnabled && 'Notification' in window) {
            if (Notification.permission === 'granted') {
              new Notification('Work cycle complete', { body: 'Time for reflection' });
            } else if (Notification.permission !== 'denied') {
              Notification.requestPermission().then((p) => {
                if (p === 'granted') new Notification('Work cycle complete', { body: 'Time for reflection' });
              });
            }
          }

          set({ 
            timeRemaining: 0,
            timerStatus: 'completed',
            currentScreen: 'cycle-reflection'
          });

          if (isElectron()) ipcUpdateTray('');
        } else {
          const newTime = timeRemaining - 1;
          if (isElectron()) {
            const { settings } = get();
            if (settings?.trayTimerEnabled) {
              ipcUpdateTray(fmt(newTime));
            }
          }
          set({ timeRemaining: newTime });
        }
      },
      
      // Voice notes
      addVoiceNote: (note) => {
        const { voiceNotes } = get();
        const newNote: VoiceNote = {
          ...note,
          id: generateId(),
        };
        set({ voiceNotes: [...voiceNotes, newNote] });
      },
      
      // Settings handlers
      loadSettings: async () => {
        if (isElectron()) {
          try {
            const data = await ipcGetSettings();
            set({ settings: data });
            if (!data.trayTimerEnabled) {
              ipcUpdateTray('');
            }
          } catch (err) {
            /* eslint-disable no-console */
            console.error('Failed to load settings', err);
          }
        } else {
          // fallback defaults for web demo
          set({
            settings: {
              aiEnabled: false,
              workMinutes: 30,
              breakMinutes: 10,
              cyclesPlanned: 6,
              chimeEnabled: true,
              notifyEnabled: true,
              hotkey: 'Control+Shift+U',
              trayTimerEnabled: true,
            },
          });
        }
      },

      updateSettings: async (patch) => {
        if (isElectron()) {
          try {
            await ipcSaveSettings(patch);
            // merge locally
            set((state) => {
              const merged = { ...state.settings!, ...patch } as Settings;
              // handle tray toggle
              if (!merged.trayTimerEnabled) {
                ipcUpdateTray('');
              } else if (merged.trayTimerEnabled && state.timerStatus === 'running') {
                ipcUpdateTray(fmt(state.timeRemaining));
              }
              return { settings: merged };
            });
          } catch (err) {
            console.error('Failed to save settings', err);
          }
        } else {
          set((state) => ({ settings: { ...state.settings!, ...patch } }));
        }
      },
    }),
    {
      name: 'workcycles-storage',
      partialize: (state) => ({
        sessions: state.sessions,
        voiceNotes: state.voiceNotes,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Convert date strings back to Date objects after rehydration
          state.sessions = reviveDates(state.sessions);
          state.voiceNotes = reviveDates(state.voiceNotes);
        }
      },
    }
  )
);