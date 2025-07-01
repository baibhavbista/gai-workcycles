import React from 'react';
import { Clock, History, Target, Play } from 'lucide-react';
import { useWorkCyclesStore } from '../store/useWorkCyclesStore';

export function HomeScreen() {
  const { setScreen } = useWorkCyclesStore();
  
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
            Lock in your focus with structured work cycles, clear intentions, and continuous reflection.
          </p>
        </div>
        
        {/* Feature highlights */}
        <div className="flex justify-center gap-8 mb-8 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#482F60]" />
            30-minute focused cycles
          </div>
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-[#482F60]" />
            Structured reflection
          </div>
        </div>
        
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
          
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <History className="w-6 h-6 text-gray-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">Session History</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Review past sessions and analyze your productivity patterns
                </p>
                <button
                  onClick={() => setScreen('history')}
                  className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-xl font-medium hover:bg-gray-200 transition-colors duration-200"
                >
                  View History
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Info section */}
        <div className="bg-gray-50 rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <Target className="w-5 h-5 text-[#482F60] flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">How WorkCycles Works</h4>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                WorkCycles implements the methodology developed by the late UltraWorking.com. Each 
                session consists of three phases: setting clear intentions, working in focused 
                cycles with breaks, and reflecting on your progress.
              </p>
              <div className="space-y-2 text-sm text-gray-600">
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}