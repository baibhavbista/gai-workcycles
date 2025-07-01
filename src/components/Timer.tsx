import React, { useEffect } from 'react';
import { useWorkCyclesStore } from '../store/useWorkCyclesStore';

interface TimerProps {
  size?: number;
}

export function Timer({ size = 200 }: TimerProps) {
  const { timeRemaining, timerStatus, tick, currentSession } = useWorkCyclesStore();
  
  useEffect(() => {
    if (timerStatus === 'running') {
      const interval = setInterval(tick, 1000);
      return () => clearInterval(interval);
    }
  }, [timerStatus, tick]);
  
  const totalTime = currentSession?.intentions.workMinutes ? currentSession.intentions.workMinutes * 60 : 1800;
  const progress = 1 - (timeRemaining / totalTime); // Progress from 0 to 1
  
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  
  const circumference = 2 * Math.PI * (size / 2 - 10);
  const strokeDashoffset = circumference * (1 - progress);
  
  // Calculate dot position
  const angle = progress * 2 * Math.PI - Math.PI / 2; // Start from top
  const dotX = size / 2 + (size / 2 - 10) * Math.cos(angle);
  const dotY = size / 2 + (size / 2 - 10) * Math.sin(angle);
  
  return (
    <div className="relative flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 10}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="8"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 10}
          fill="none"
          stroke="#6366f1"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-linear"
        />
        {/* Progress indicator dot */}
        <circle
          cx={dotX}
          cy={dotY}
          r="6"
          fill="#6366f1"
          className="transition-all duration-1000 ease-linear"
        />
      </svg>
      
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-4xl font-bold text-[#482F60] font-mono">
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </div>
        <div className="text-sm text-gray-500 mt-1 flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full ${
            timerStatus === 'running' ? 'bg-green-500' : 
            timerStatus === 'paused' ? 'bg-yellow-500' : 
            'bg-gray-400'
          }`} />
          {timerStatus === 'running' ? 'Active' : 
           timerStatus === 'paused' ? 'Paused' : 
           'Ready'}
        </div>
      </div>
    </div>
  );
}