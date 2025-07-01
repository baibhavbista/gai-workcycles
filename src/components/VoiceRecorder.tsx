import React, { useState } from 'react';
import { Mic, MicOff, Loader2, CheckCircle } from 'lucide-react';

type RecordingState = 'idle' | 'recording' | 'processing' | 'complete';

interface VoiceRecorderProps {
  onComplete?: (transcript: string) => void;
  className?: string;
}

export function VoiceRecorder({ onComplete, className = '' }: VoiceRecorderProps) {
  const [state, setState] = useState<RecordingState>('idle');
  
  const handleClick = () => {
    switch (state) {
      case 'idle':
        setState('recording');
        // Simulate recording start
        break;
      case 'recording':
        setState('processing');
        // Simulate processing
        setTimeout(() => {
          setState('complete');
          setTimeout(() => {
            setState('idle');
            onComplete?.('Sample transcribed text from voice recording...');
          }, 1500);
        }, 2000);
        break;
      case 'processing':
      case 'complete':
        // Do nothing during these states
        break;
    }
  };
  
  const getButtonContent = () => {
    switch (state) {
      case 'idle':
        return (
          <>
            <Mic className="w-5 h-5" />
            <span className="text-sm font-medium">Voice Fill</span>
          </>
        );
      case 'recording':
        return (
          <>
            <MicOff className="w-5 h-5 text-red-500" />
            <span className="text-sm font-medium text-red-600">Recording...</span>
          </>
        );
      case 'processing':
        return (
          <>
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <span className="text-sm font-medium text-blue-600">Processing...</span>
          </>
        );
      case 'complete':
        return (
          <>
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="text-sm font-medium text-green-600">Complete!</span>
          </>
        );
    }
  };
  
  const getButtonStyle = () => {
    switch (state) {
      case 'idle':
        return 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700';
      case 'recording':
        return 'bg-red-50 border-red-200 text-red-600 animate-pulse';
      case 'processing':
        return 'bg-blue-50 border-blue-200 text-blue-600';
      case 'complete':
        return 'bg-green-50 border-green-200 text-green-600';
    }
  };
  
  return (
    <button
      onClick={handleClick}
      disabled={state === 'processing' || state === 'complete'}
      className={`flex items-center gap-2 px-4 py-2 border rounded-xl transition-all duration-200 ${getButtonStyle()} ${className}`}
    >
      {getButtonContent()}
    </button>
  );
}