import React, { useEffect, useState } from 'react';
import { Coffee, Pause, Square } from 'lucide-react';
import { useWorkCyclesStore } from '../store/useWorkCyclesStore';
import { Timer } from '../components/Timer';

export function BreakScreen() {
  const { currentSession, setScreen } = useWorkCyclesStore();
  const [timeRemaining, setTimeRemaining] = useState(
    (currentSession?.intentions.breakMinutes || 5) * 60
  );
  const [timerStatus, setTimerStatus] = useState<'running' | 'paused'>('running');
  
  useEffect(() => {
    if (timeRemaining <= 0) {
      setScreen('break-complete');
      return;
    }
    
    if (timerStatus === 'running') {
      const interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            setScreen('break-complete');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [timeRemaining, timerStatus, setScreen]);
  
  const handlePause = () => {
    setTimerStatus(prev => prev === 'running' ? 'paused' : 'running');
  };
  
  const handleSkipBreak = () => {
    setScreen('break-complete');
  };
  
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  
  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6">
      <div className="max-w-md mx-auto text-center">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Break Time</h1>
          <p className="text-gray-600">
            Take a well-deserved 5-minute break. Step away from your work and recharge.
          </p>
        </div>
        
        {/* Timer */}
        <div className="mb-8">
          <div className="relative flex items-center justify-center mb-6">
            <svg width={240} height={240} className="transform -rotate-90">
              {/* Background circle */}
              <circle
                cx={120}
                cy={120}
                r={110}
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="8"
              />
              {/* Progress circle */}
              <circle
                cx={120}
                cy={120}
                r={110}
                fill="none"
                stroke="#6366f1"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 110}
                strokeDashoffset={2 * Math.PI * 110 * (timeRemaining / ((currentSession?.intentions.breakMinutes || 5) * 60))}
                className="transition-all duration-1000 ease-linear"
              />
              {/* Progress indicator dot */}
              <circle
                cx={120 + 110 * Math.cos((1 - timeRemaining / ((currentSession?.intentions.breakMinutes || 5) * 60)) * 2 * Math.PI - Math.PI / 2)}
                cy={120 + 110 * Math.sin((1 - timeRemaining / ((currentSession?.intentions.breakMinutes || 5) * 60)) * 2 * Math.PI - Math.PI / 2)}
                r="6"
                fill="#6366f1"
                className="transition-all duration-1000 ease-linear"
              />
            </svg>
            
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-4xl font-bold text-[#6366f1] font-mono">
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </div>
              <div className="text-sm text-green-500 mt-1 flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                Active
              </div>
            </div>
          </div>
        </div>
        
        {/* Controls */}
        <div className="flex justify-center gap-4 mb-12">
          <button
            onClick={handlePause}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors duration-200"
          >
            <Pause className="w-4 h-4" />
            Pause
          </button>
          
          <button
            onClick={handleSkipBreak}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium bg-red-500 text-white hover:bg-red-600 transition-colors duration-200"
          >
            <Square className="w-4 h-4" />
            Skip break
          </button>
        </div>
        
        {/* Break suggestions */}
        <div className="bg-green-50 rounded-2xl p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Make the Most of Your Break</h3>
          <div className="space-y-2 text-sm text-gray-600 text-left">
            <div>• Stand up and stretch</div>
            <div>• Look away from your screen</div>
            <div>• Take a few deep breaths</div>
            <div>• Grab some water or tea</div>
            <div>• Avoid checking social media or emails</div>
          </div>
        </div>
      </div>
    </div>
  );
}