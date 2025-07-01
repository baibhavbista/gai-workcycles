import React, { useEffect, useState } from 'react';
import { Calendar, Clock, Target, TrendingUp, Table } from 'lucide-react';
import { useWorkCyclesStore } from '../store/useWorkCyclesStore';
import { isElectron, listSessions as ipcListSessions } from '../electron-ipc';
import { BackButton } from '../components/BackButton';

export function HistoryScreen() {
  const { sessions, setScreen, setCurrentSession } = useWorkCyclesStore();
  
  const [remoteSessions, setRemoteSessions] = useState<any[] | null>(null);

  useEffect(() => {
    if (isElectron()) {
      ipcListSessions().then(setRemoteSessions).catch(console.error);
    }
  }, []);

  const allSessions = isElectron() ? remoteSessions ?? [] : sessions;
  
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };
  
  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  };
  
  const getSuccessRate = (session: any) => {
    if (session.cycles.length === 0) return 0;
    const hits = session.cycles.filter((c: any) => c.status === 'hit').length;
    return Math.round((hits / session.cycles.length) * 100);
  };

  const handleViewSpreadsheet = (session: any) => {
    setCurrentSession(session);
    setScreen('session-spreadsheet');
  };
  
  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <BackButton />
          <h1 className="text-xl font-bold text-gray-900">Session History</h1>
          <div className="w-9" /> {/* Spacer */}
        </div>
        
        {allSessions.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-2xl mb-4">
              <Calendar className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No sessions yet</h3>
            <p className="text-gray-600 mb-6">
              Start your first WorkCycles session to see your history here.
            </p>
            <button
              onClick={() => setScreen('session-intentions')}
              className="px-6 py-3 bg-[#482F60] text-white rounded-xl font-medium hover:bg-[#3d2651] transition-colors duration-200"
            >
              Start First Session
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {allSessions.map((session) => (
              <div key={session.id} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">
                        {formatDate(new Date(session.startedAt))} at {formatTime(new Date(session.startedAt))}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-900 line-clamp-2">
                      {session.intentions.objective || 'Session objective'}
                    </h3>
                  </div>
                  <div className="text-right ml-4">
                    <div className="text-lg font-bold text-[#482F60]">
                      {getSuccessRate(session)}%
                    </div>
                    <div className="text-xs text-gray-500">success</div>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4 pt-3 border-t border-gray-100 mb-3">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Target className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-500">Cycles</span>
                    </div>
                    <div className="text-sm font-medium text-gray-900">
                      {session.cycles.length}/{session.intentions.cyclesPlanned}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-500">Duration</span>
                    </div>
                    <div className="text-sm font-medium text-gray-900">
                      {session.cycles.length * session.intentions.workMinutes}m
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <TrendingUp className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-500">Hits</span>
                    </div>
                    <div className="text-sm font-medium text-gray-900">
                      {session.cycles.filter((c: any) => c.status === 'hit').length}
                    </div>
                  </div>
                </div>

                {/* Action button */}
                <button
                  onClick={() => handleViewSpreadsheet(session)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors text-sm font-medium"
                >
                  <Table className="w-4 h-4" />
                  View as Spreadsheet
                </button>
                
                {session.intentions.objective && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="text-xs text-gray-500 mb-1">Objective</div>
                    <div className="text-sm text-gray-700 line-clamp-2">
                      {session.intentions.objective}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}