import React, { useState, useEffect } from 'react';
import { Clock, History, Target, Play, Calendar, TrendingUp, Bot } from 'lucide-react';
import { useWorkCyclesStore } from '../store/useWorkCyclesStore';
import { isElectron, listSessions } from '../electron-ipc';

export function HomeScreen() {
  const { setScreen, sessions } = useWorkCyclesStore();
  const [showInfo, setShowInfo] = useState(false);
  const [remoteSessions, setRemoteSessions] = useState<any[] | null>(null);

  useEffect(() => {
    if (isElectron()) {
      listSessions()
        .then(setRemoteSessions)
        .catch(console.error);
    }
  }, []);

  const allSessions = isElectron() ? remoteSessions ?? [] : sessions;

  // Filter sessions for today (local date)
  const todayStr = new Date().toDateString();
  const todays = allSessions.filter((s: any) => new Date(s.startedAt).toDateString() === todayStr);

  const getSuccessRate = (session: any) => {
    if (!session.cycles?.length) return 0;
    const hits = session.cycles.filter((c: any) => c.status === 'hit').length;
    return Math.round((hits / session.cycles.length) * 100);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#482F60] rounded-2xl mb-4">
            <Clock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">WorkCycles</h1>
          <p className="text-gray-600 leading-relaxed">
            UltraWorking Cycles, in a desktop app near you!
          </p>
        </div>
        
        {/* Feature highlights
        <div className="flex justify-center gap-8 mb-8 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#482F60]" />
            30-minute focused cycles
          </div>
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-[#482F60]" />
            Structured reflection
          </div>
        </div> */}
        
        {/* Main actions */}
        <div className="space-y-4 mb-8">
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-[#482F60] rounded-xl flex items-center justify-center flex-shrink-0">
                <Play className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">Start New Session</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Begin a new work cycle session with intention setting
                </p>
                <button
                  onClick={() => setScreen('session-intentions')}
                  className="w-full bg-[#482F60] text-white py-3 px-4 rounded-xl font-medium hover:bg-[#3d2651] transition-colors duration-200"
                >
                  Start Session
                </button>
              </div>
            </div>
          </div>
          
          {/* Today's sessions summary */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Today's Sessions</h3>
              <button
                onClick={() => setScreen('history')}
                className="text-sm text-[#482F60] hover:underline"
              >
                View history
              </button>
            </div>
            {todays.length === 0 ? (
              <p className="text-sm text-gray-600">No sessions yet today.</p>
            ) : (
              <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                {todays.slice(0, 3).map((session) => (
                  <div key={session.id} className="flex items-start justify-between">
                    <div className="flex-1 mr-2">
                      <div className="flex items-center gap-1 text-xs text-gray-500 mb-0.5">
                        <Calendar className="w-3 h-3" />
                        {new Intl.DateTimeFormat('en-US', { hour:'numeric', minute:'2-digit', hour12:true }).format(new Date(session.startedAt))}
                      </div>
                      <div className="text-sm text-gray-800 line-clamp-1">
                        {session.intentions?.objective || 'Session'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-700">
                      <TrendingUp className="w-4 h-4 text-gray-400" />
                      {getSuccessRate(session)}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
        </div>
        
        {/* Floating AI chat button */}
        <button
          onClick={() => alert('Yet to be implemented')}
          className="fixed bottom-20 right-6 w-10 h-10 rounded-full bg-[#482F60] text-white flex items-center justify-center shadow-lg hover:bg-[#3d2651] transition z-40"
          aria-label="Chat with AI"
        >
          <Bot className="w-5 h-5" />
        </button>

        {/* Floating help button */}
        <button
          onClick={() => setShowInfo(true)}
          className="fixed bottom-6 right-6 w-10 h-10 rounded-full bg-[#482F60] text-white flex items-center justify-center shadow-lg hover:bg-[#3d2651] transition z-40"
          aria-label="How it works"
        >
          ?
        </button>

        {/* Info modal */}
        {showInfo && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 mx-4 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-xl">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-[#482F60]" />
                <h4 className="font-semibold text-gray-900">How WorkCycles Works</h4>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                WorkCycles implements the methodology developed by the late UltraWorking.com. Each
                session consists of three phases: setting clear intentions, working in focused
                cycles with breaks, and reflecting on your progress.
              </p>
              <div className="space-y-2 text-sm text-gray-600 mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-[#482F60] rounded-full" />
                  Focused 30-minute work cycles
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-[#482F60] rounded-full" />
                  10-minute breaks between cycles
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-[#482F60] rounded-full" />
                  Structured reflection and review
                </div>
              </div>
              <button
                onClick={() => setShowInfo(false)}
                className="w-full py-2 bg-[#482F60] text-white rounded-xl hover:bg-[#3d2651] transition"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}