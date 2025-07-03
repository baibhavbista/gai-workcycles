import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { getOpenAIKey } from '../electron-ipc';
import { QuestionSpec, autoFillForm, transcribeAudio } from '../client-side-ai';

type RecordingState = 'idle' | 'recording' | 'processing' | 'complete' | 'error';

interface VoiceRecorderProps {
  /** Optional form schema to auto-fill after transcription */
  formSchema?: Array<QuestionSpec>;
  /** Callback with transcript and (optional) filled form data */
  onComplete?: (transcript: string, filled?: Record<string, string>) => void;
  className?: string;
}

export function VoiceRecorder({ formSchema, onComplete, className = '' }: VoiceRecorderProps) {
  const [state, setState] = useState<RecordingState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [tooltipStyle, setTooltipStyle] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  useEffect(() => {
    // Check for API key on mount
    getOpenAIKey().then(key => {
      setHasApiKey(!!key);
    }).catch(error => {
      console.error('Failed to check OpenAI key:', error);
      setHasApiKey(false);
    });
  }, []);

  // Update tooltip position when button position changes
  useEffect(() => {
    const updateTooltipPosition = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setTooltipStyle({
          top: rect.bottom + 8, // Center vertically
          left: rect.left - rect.width * 0.6, 
        });
      }
    };

    updateTooltipPosition();
    window.addEventListener('resize', updateTooltipPosition);
    window.addEventListener('scroll', updateTooltipPosition);

    return () => {
      window.removeEventListener('resize', updateTooltipPosition);
      window.removeEventListener('scroll', updateTooltipPosition);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      mediaRecorder.current.onstop = async () => {
        try {
          setState('processing');
          const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });

          const apiKey = await getOpenAIKey();
          if (!apiKey) throw new Error('OpenAI API key missing');
          const transcript = await transcribeAudio(audioBlob, apiKey);

          let filled: Record<string, string> | undefined;

          // 2. If a form schema is provided, call GPT to fill it
          if (formSchema && formSchema.length) {
            try {
              filled = await autoFillForm(transcript, formSchema, apiKey);
            } catch (err) {
              console.error('Auto-fill error:', err);
              // We don't fail hard; just show transcript.
            }
          }

          // 3. Show result for now
          if (filled) {
            console.log(`Form data:\n${JSON.stringify(filled, null, 2)}`);
          } else {
            console.log(`Transcript:\n${transcript}`);
          }
          onComplete?.(transcript, filled);

          // Reset for next recording
          audioChunks.current = [];
          setState('complete');

          setTimeout(() => {
            setState('idle');
          }, 1500);
        } catch (error) {
          console.error('Error processing audio:', error);
          setState('error');
          setErrorMessage(error instanceof Error ? error.message : 'Failed to process audio');
        }
      };

      mediaRecorder.current.start();
      setState('recording');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setState('error');
      setErrorMessage('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop();
      // Stop all tracks on the active stream
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
    }
  };
  
  const handleClick = () => {
    switch (state) {
      case 'idle':
        startRecording();
        break;
      case 'recording':
        stopRecording();
        break;
      case 'processing':
      case 'complete':
      case 'error':
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
            <span className="text-sm font-medium text-red-600">Recording</span>
          </>
        );
      case 'processing':
        return (
          <>
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <span className="text-sm font-medium text-blue-600">Processing…</span>
          </>
        );
      case 'complete':
        return (
          <>
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="text-sm font-medium text-green-600">Form filled!</span>
          </>
        );
      case 'error':
        return (
          <>
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-sm font-medium text-red-600">{errorMessage}</span>
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
      case 'error':
        return 'bg-red-50 border-red-200 text-red-600';
    }
  };
  
  return (
    <div className="relative inline-block group">
      <button
        ref={buttonRef}
        onClick={handleClick}
        disabled={!hasApiKey || state === 'processing' || state === 'complete'}
        className={`flex items-center gap-2 px-4 py-2 border rounded-xl transition-all duration-200 
          ${getButtonStyle()} ${className}
          ${!hasApiKey ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {getButtonContent()}
      </button>
      {!hasApiKey && (
        <div 
          className="fixed z-[9999] invisible group-hover:visible"
          style={{
            top: `${tooltipStyle.top}px`,
            left: `${tooltipStyle.left}px`,
            transform: 'translateX(0)',
          }}
        >
          <div className="relative bg-gray-900 text-white text-sm px-4 py-2 rounded shadow-lg whitespace-nowrap">
            Home &gt; Settings to enable AI
            <div className="absolute left-1/2 -translate-x-1/2 -top-2 border-4 border-transparent border-b-gray-900"></div>
          </div>
        </div>
      )}
    </div>
  );
}