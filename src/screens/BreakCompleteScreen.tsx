import React from 'react';
import { Coffee, ArrowRight } from 'lucide-react';
import { useWorkCyclesStore } from '../store/useWorkCyclesStore';

export function BreakCompleteScreen() {
  const { currentSession, setScreen } = useWorkCyclesStore();
  
  const handleNextCycle = () => {
    setScreen('pre-cycle');
  };
  
  const handleFinishSession = () => {
    setScreen('session-review');
  };
  
  const currentCycleNumber = (currentSession?.currentCycleIdx || 0) + 1;
  const isLastCycle = currentSession && currentCycleNumber >= currentSession.intentions.cyclesPlanned;
  
  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6">
      <div className="max-w-md mx-auto text-center">
        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
            <Coffee className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Break Complete!</h1>
          <p className="text-gray-600">
            Ready for your next cycle, or would you like to finish this session?
          </p>
        </div>
        
        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={handleFinishSession}
            className="flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-gray-200 hover:bg-gray-50 transition-colors duration-200"
          >
            <Coffee className="w-8 h-8 text-gray-600 mb-3" />
            <span className="font-semibold text-gray-900 mb-1">Finish Session</span>
            <span className="text-sm text-gray-500">Complete and review</span>
          </button>
          
          <button
            onClick={handleNextCycle}
            className="flex flex-col items-center justify-center p-8 bg-[#6366f1] text-white rounded-2xl hover:bg-[#5855eb] transition-colors duration-200"
          >
            <ArrowRight className="w-8 h-8 mb-3" />
            <span className="font-semibold mb-1">Next Cycle</span>
            <span className="text-sm text-purple-200">
              Cycle {currentCycleNumber + 1}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}