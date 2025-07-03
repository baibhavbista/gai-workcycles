import React, { useState, useEffect, useRef } from 'react';
import { Pause, Play, Square, Mic, MicOff, Target, Plus, Edit3, Loader2 } from 'lucide-react';
import { useWorkCyclesStore } from '../store/useWorkCyclesStore';
import { Timer } from '../components/Timer';
import { getOpenAIKey, saveCycleNote, getCycleNotes, getSessionNotes, updateCycleNote, isElectron, type CycleNote } from '../electron-ipc';
import { transcribeAudio } from '../client-side-ai';

// Using CycleNote from electron-ipc instead of local LogEntry
type LogEntry = CycleNote;

type RecordingState = 'idle' | 'recording' | 'processing' | 'complete';

export function TimerScreen() {
  const { 
    currentSession, 
    currentCycle, 
    timerStatus, 
    startTimer, 
    pauseTimer, 
    finishEarly 
  } = useWorkCyclesStore();
  
  const [workRecordingState, setWorkRecordingState] = useState<RecordingState>('idle');
  const [distractionRecordingState, setDistractionRecordingState] = useState<RecordingState>('idle');
  const [activeTab, setActiveTab] = useState<'work' | 'distraction'>('work');
  const [workLog, setWorkLog] = useState<LogEntry[]>([]);
  const [distractionLog, setDistractionLog] = useState<LogEntry[]>([]);
  const [sessionWorkNotesOtherCycles, setSessionWorkNotesOtherCycles] = useState<LogEntry[]>([]);
  const [sessionDistractionNotesOtherCycles, setSessionDistractionNotesOtherCycles] = useState<LogEntry[]>([]);
  const [showingSessionNotes, setShowingSessionNotes] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const currentStream = useRef<MediaStream | null>(null);
  
  // Start timer automatically when component mounts
  useEffect(() => {
    if (timerStatus === 'idle') {
      startTimer();
    }
  }, []);

  // Load existing notes on mount
  useEffect(() => {
    const loadNotes = async () => {
      if (isElectron() && currentSession && currentCycle) {
        try {
          // Load current cycle notes
          const cycleNotes = await getCycleNotes(currentSession.id, currentCycle.id);
          const workNotes = cycleNotes.filter(note => note.noteType === 'work');
          const distractionNotes = cycleNotes.filter(note => note.noteType === 'distraction');
          setWorkLog(workNotes);
          setDistractionLog(distractionNotes);

          // Load all session notes and split by cycle
          const sessionNotes = await getSessionNotes(currentSession.id);
          const currentCycleId = currentCycle.id;
          
          // Filter out current cycle notes to get "other cycles" notes
          const otherCycleNotes = sessionNotes.filter(note => note.cycleId !== currentCycleId);
          
          // Split other cycle notes by type
          const sessionWorkOther = otherCycleNotes.filter(note => note.noteType === 'work');
          const sessionDistractionOther = otherCycleNotes.filter(note => note.noteType === 'distraction');
          
          setSessionWorkNotesOtherCycles(sessionWorkOther);
          setSessionDistractionNotesOtherCycles(sessionDistractionOther);
        } catch (error) {
          console.error('Failed to load notes:', error);
        }
      }
    };
    
    loadNotes();
  }, [currentSession?.id, currentCycle?.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up any active recording
      if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
        mediaRecorder.current.stop();
      }
      if (currentStream.current) {
        currentStream.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);
  
  const handleStartPause = () => {
    if (timerStatus === 'idle') {
      startTimer();
    } else {
      pauseTimer();
    }
  };
  
  const cleanupRecording = () => {
    if (currentStream.current) {
      currentStream.current.getTracks().forEach(track => track.stop());
      currentStream.current = null;
    }
    audioChunks.current = [];
    mediaRecorder.current = null;
  };

  const handleVoiceNote = async (kind: 'work' | 'distraction') => {
    const isRecording = kind === 'work' ? workRecordingState : distractionRecordingState;
    const setRecordingState = kind === 'work' ? setWorkRecordingState : setDistractionRecordingState;
    
    // Prevent multiple rapid clicks
    if (isRecording === 'processing' || isRecording === 'complete') {
      return;
    }
    
    if (isRecording === 'idle') {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        currentStream.current = stream;
        mediaRecorder.current = new MediaRecorder(stream);
        
        mediaRecorder.current.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunks.current.push(event.data);
          }
        };

        mediaRecorder.current.onstop = async () => {
          try {
            setRecordingState('processing');
            
            if (audioChunks.current.length === 0) {
              throw new Error('No audio data recorded');
            }
            
            const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });

            const apiKey = await getOpenAIKey();
            if (!apiKey) throw new Error('OpenAI API key missing');
            const transcript = await transcribeAudio(audioBlob, apiKey);

            if (!transcript.trim()) {
              throw new Error('No speech detected');
            }

            // Save to database and update local state
            const timestamp = new Date();
            if (isElectron()) {
              try {
                const noteId = await saveCycleNote({
                  sessionId: currentSession!.id,
                  cycleId: currentCycle!.id,
                  cycleIdx: currentCycle!.idx,
                  noteType: kind,
                  entryType: 'voice',
                  text: transcript,
                  timestamp,
                });
                
                // Create complete entry for local state
                const completeEntry: LogEntry = {
                  id: noteId,
                  sessionId: currentSession!.id,
                  cycleId: currentCycle!.id,
                  cycleIdx: currentCycle!.idx,
                  noteType: kind,
                  entryType: 'voice',
                  text: transcript,
                  timestamp,
                  createdAt: timestamp, // Approximate since we don't get it back from save
                };
                
                if (kind === 'work') {
                  setWorkLog(prev => [completeEntry, ...prev]);
                } else {
                  setDistractionLog(prev => [completeEntry, ...prev]);
                }
              } catch (error) {
                console.error('Failed to save cycle note:', error);
                // Could show user notification here
              }
            } else {
              // Fallback for web - create a mock entry
              const mockEntry: LogEntry = {
                id: Math.random().toString(36).substring(2),
                sessionId: 'mock-session',
                cycleId: 'mock-cycle',
                cycleIdx: 0,
                noteType: kind,
                entryType: 'voice',
                text: transcript,
                timestamp,
                createdAt: timestamp,
              };
              
              if (kind === 'work') {
                setWorkLog(prev => [mockEntry, ...prev]);
              } else {
                setDistractionLog(prev => [mockEntry, ...prev]);
              }
            }

            setRecordingState('complete');

            setTimeout(() => {
              setRecordingState('idle');
            }, 1500);
          } catch (error) {
            console.error('Error processing audio:', error);
            setRecordingState('idle');
            // You could add a toast notification here to show the error to the user
          } finally {
            cleanupRecording();
          }
        };

        mediaRecorder.current.onerror = (event) => {
          console.error('MediaRecorder error:', event);
          setRecordingState('idle');
          cleanupRecording();
        };

        mediaRecorder.current.start();
        setRecordingState('recording');
      } catch (error) {
        console.error('Error accessing microphone:', error);
        setRecordingState('idle');
        cleanupRecording();
        // You could add a toast notification here to show the error to the user
      }
    } else if (isRecording === 'recording') {
      // Stop recording and process
      if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
        mediaRecorder.current.stop();
      }
    }
  };
  
  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    
    const timestamp = new Date();
    
    if (isElectron() && currentSession && currentCycle) {
      try {
        const noteId = await saveCycleNote({
          sessionId: currentSession.id,
          cycleId: currentCycle.id,
          cycleIdx: currentCycle.idx,
          noteType: activeTab,
          entryType: 'manual',
          text: newNote.trim(),
          timestamp,
        });
        
        const completeEntry: LogEntry = {
          id: noteId,
          sessionId: currentSession.id,
          cycleId: currentCycle.id,
          cycleIdx: currentCycle.idx,
          noteType: activeTab,
          entryType: 'manual',
          text: newNote.trim(),
          timestamp,
          createdAt: timestamp,
        };
        
        if (activeTab === 'work') {
          setWorkLog(prev => [completeEntry, ...prev]);
        } else {
          setDistractionLog(prev => [completeEntry, ...prev]);
        }
      } catch (error) {
        console.error('Failed to save manual note:', error);
      }
    } else {
      // Fallback for web or missing session/cycle
      const mockEntry: LogEntry = {
        id: Math.random().toString(36).substring(2),
        sessionId: 'mock-session',
        cycleId: 'mock-cycle',
        cycleIdx: 0,
        noteType: activeTab,
        entryType: 'manual',
        text: newNote.trim(),
        timestamp,
        createdAt: timestamp,
      };
      
      if (activeTab === 'work') {
        setWorkLog(prev => [mockEntry, ...prev]);
      } else {
        setDistractionLog(prev => [mockEntry, ...prev]);
      }
    }
    
    setNewNote('');
  };
  
  const handleEditEntry = async (entryId: string, newText: string) => {
    if (isElectron()) {
      try {
        await updateCycleNote(entryId, newText);
        
        // Update local state
        if (activeTab === 'work') {
          setWorkLog(prev => prev.map(entry => 
            entry.id === entryId ? { ...entry, text: newText } : entry
          ));
        } else {
          setDistractionLog(prev => prev.map(entry => 
            entry.id === entryId ? { ...entry, text: newText } : entry
          ));
        }
      } catch (error) {
        console.error('Failed to update note:', error);
        // Could show user notification here
      }
    } else {
      // Fallback for web
      if (activeTab === 'work') {
        setWorkLog(prev => prev.map(entry => 
          entry.id === entryId ? { ...entry, text: newText } : entry
        ));
      } else {
        setDistractionLog(prev => prev.map(entry => 
          entry.id === entryId ? { ...entry, text: newText } : entry
        ));
      }
    }
    
    setEditingEntry(null);
    setEditText('');
  };
  
  const getVoiceButtonContent = (state: RecordingState, kind: 'work' | 'distraction') => {
    switch (state) {
      case 'idle':
        return <Mic className="w-6 h-6 text-gray-600" />;
      case 'recording':
        return <MicOff className={`w-6 h-6 ${kind === 'work' ? 'text-green-600' : 'text-red-600'}`} />;
      case 'processing':
        return <Loader2 className={`w-6 h-6 animate-spin ${kind === 'work' ? 'text-green-600' : 'text-red-600'}`} />;
      case 'complete':
        return <div className={`w-6 h-6 rounded-full ${kind === 'work' ? 'bg-green-600' : 'bg-red-600'} flex items-center justify-center`}>
          <div className="w-2 h-2 bg-white rounded-full" />
        </div>;
    }
  };
  
  const getVoiceButtonStyle = (state: RecordingState, kind: 'work' | 'distraction') => {
    const baseStyle = "p-4 rounded-xl border-2 border-dashed transition-all duration-200";
    const otherState = kind === 'work' ? distractionRecordingState : workRecordingState;
    const isDisabledByOther = otherState === 'recording' || otherState === 'processing';
    
    if (isDisabledByOther && state === 'idle') {
      return `${baseStyle} border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed`;
    }
    
    switch (state) {
      case 'idle':
        return `${baseStyle} border-gray-300 hover:border-gray-400 bg-white`;
      case 'recording':
        return `${baseStyle} ${kind === 'work' ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'} animate-pulse`;
      case 'processing':
        return `${baseStyle} ${kind === 'work' ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}`;
      case 'complete':
        return `${baseStyle} ${kind === 'work' ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}`;
    }
  };
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };
  
  const currentCycleNumber = (currentCycle?.idx || 0) + 1;
  
  // Combine current cycle notes with other cycle notes, sorted chronologically
  const getCombinedSessionNotes = (noteType: 'work' | 'distraction') => {
    const currentNotes = noteType === 'work' ? workLog : distractionLog;
    const otherNotes = noteType === 'work' ? sessionWorkNotesOtherCycles : sessionDistractionNotesOtherCycles;
    
    // Combine and sort by timestamp (newest first)
    return [...currentNotes, ...otherNotes].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  };

  // Determine what to show based on current state
  const getCurrentLog = () => {
    if (showingSessionNotes) {
      return getCombinedSessionNotes(activeTab);
    } else {
      // Show current cycle notes
      return activeTab === 'work' ? workLog : distractionLog;
    }
  };
  
  const currentLog = getCurrentLog();
  
  // Reset to cycle view when switching tabs
  const handleTabSwitch = (tab: 'work' | 'distraction') => {
    setActiveTab(tab);
    setShowingSessionNotes(false);
  };
  
  const toggleSessionView = () => {
    setShowingSessionNotes(!showingSessionNotes);
  };
  
  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Cycle {currentCycleNumber} in Progress
          </h1>
        </div>
        
        {/* Goal in a compact card */}
        {currentCycle?.goal && (
          <div className="bg-[#482F60] text-white rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4" />
              <span className="text-sm font-medium opacity-90">Current Goal</span>
            </div>
            <p className="text-sm leading-relaxed">{currentCycle.goal}</p>
          </div>
        )}
        
        {/* Timer and Controls Side by Side */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex justify-center flex-1">
            <Timer size={200} />
          </div>
          
          <div className="flex flex-col gap-3 ml-6">
            <button
              onClick={handleStartPause}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all duration-200 ${
                timerStatus === 'running'
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'bg-[#482F60] text-white hover:bg-[#3d2651]'
              }`}
            >
              {timerStatus === 'running' ? (
                <>
                  <Pause className="w-4 h-4" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  {timerStatus === 'idle' ? 'Start' : 'Resume'}
                </>
              )}
            </button>
            
            <button
              onClick={finishEarly}
              className="flex items-center gap-2 px-4 py-3 rounded-xl font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-all duration-200"
            >
              <Square className="w-4 h-4" />
              Finish early
            </button>
          </div>
        </div>
        
        {/* Voice notes */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => handleVoiceNote('work')}
            disabled={workRecordingState === 'processing' || workRecordingState === 'complete' || distractionRecordingState === 'recording' || distractionRecordingState === 'processing'}
            className={getVoiceButtonStyle(workRecordingState, 'work')}
          >
            <div className="flex flex-col items-center gap-2">
              {getVoiceButtonContent(workRecordingState, 'work')}
              <span className="text-sm font-medium text-gray-700">
                {workRecordingState === 'recording' ? 'Click to stop recording' : 
                 workRecordingState === 'processing' ? 'Processing...' :
                 workRecordingState === 'complete' ? 'Added!' :
                 'Record Work Note'}
              </span>
            </div>
          </button>
          
          <button
            onClick={() => handleVoiceNote('distraction')}
            disabled={distractionRecordingState === 'processing' || distractionRecordingState === 'complete' || workRecordingState === 'recording' || workRecordingState === 'processing'}
            className={getVoiceButtonStyle(distractionRecordingState, 'distraction')}
          >
            <div className="flex flex-col items-center gap-2">
              {getVoiceButtonContent(distractionRecordingState, 'distraction')}
              <span className="text-sm font-medium text-gray-700">
                {distractionRecordingState === 'recording' ? 'Click to stop recording' : 
                 distractionRecordingState === 'processing' ? 'Processing...' :
                 distractionRecordingState === 'complete' ? 'Added!' :
                 'Record distractions'}
              </span>
            </div>
          </button>
        </div>
        
        {/* Logs section */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          {/* Tab headers with better visual distinction */}
          <div className="border-b border-gray-100">
            <div className="flex">
              <button
                onClick={() => handleTabSwitch('work')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-all duration-200 relative ${
                  activeTab === 'work'
                    ? 'text-[#482F60] bg-gray-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-25'
                }`}
              >
                Work Log ({showingSessionNotes ? getCombinedSessionNotes('work').length : workLog.length})
                {activeTab === 'work' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#482F60]" />
                )}
              </button>
              <button
                onClick={() => handleTabSwitch('distraction')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-all duration-200 relative ${
                  activeTab === 'distraction'
                    ? 'text-[#482F60] bg-gray-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-25'
                }`}
              >
                Distraction Journal ({showingSessionNotes ? getCombinedSessionNotes('distraction').length : distractionLog.length})
                {activeTab === 'distraction' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#482F60]" />
                )}
              </button>
            </div>
            

          </div>
          
          {/* Add note input */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex gap-2">
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder={`Add a ${activeTab} note...`}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#482F60] focus:border-[#482F60] transition-colors"
                onKeyPress={(e) => e.key === 'Enter' && handleAddNote()}
              />
              <button
                onClick={handleAddNote}
                disabled={!newNote.trim()}
                className="px-3 py-2 bg-[#482F60] text-white rounded-lg hover:bg-[#3d2651] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {/* Tab content */}
          <div className="p-4 min-h-[200px] max-h-[300px] overflow-y-auto">
            <div className="space-y-3">
              {currentLog.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">
                    {showingSessionNotes 
                      ? `No ${activeTab} notes in this session yet.`
                      : `No ${activeTab} notes yet.`
                    }
                  </p>
                  {!showingSessionNotes && (
                    <p className="text-xs mt-1">Use the microphone above or type to add notes.</p>
                  )}
                </div>
              ) : (
                currentLog.map((entry) => (
                  <div key={entry.id} className={`flex gap-3 p-3 rounded-lg ${
                    showingSessionNotes && entry.cycleId === currentCycle?.id
                      ? (activeTab === 'work' ? 'bg-blue-50 border border-blue-200' : 'bg-red-100 border border-red-200')
                      : (activeTab === 'work' ? 'bg-gray-50' : 'bg-red-50')
                  }`}>
                    <div className="text-xs text-gray-500 font-mono mt-0.5 flex-shrink-0">
                      <div>{formatTime(entry.timestamp)}</div>
                      {showingSessionNotes && (
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          Cycle {entry.cycleIdx + 1}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      {editingEntry === entry.id ? (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-[#482F60] focus:border-[#482F60]"
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                handleEditEntry(entry.id, editText);
                              } else if (e.key === 'Escape') {
                                setEditingEntry(null);
                                setEditText('');
                              }
                            }}
                            autoFocus
                          />
                          <button
                            onClick={() => handleEditEntry(entry.id, editText)}
                            className="px-2 py-1 bg-[#482F60] text-white rounded text-xs hover:bg-[#3d2651]"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between group">
                          <div className="text-sm text-gray-700 flex-1">
                            {entry.text}
                          </div>
                          <button
                            onClick={() => {
                              setEditingEntry(entry.id);
                              setEditText(entry.text);
                            }}
                            className="opacity-0 group-hover:opacity-100 ml-2 p-1 text-gray-400 hover:text-gray-600 transition-all"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* Show more button - centered at bottom */}
            {(() => {
              const otherCycleNotesForTab = activeTab === 'work' ? sessionWorkNotesOtherCycles : sessionDistractionNotesOtherCycles;
              const additionalNotes = otherCycleNotesForTab.length;
              
              if (showingSessionNotes) {
                // Show back button when viewing session notes
                return (
                  <div className="text-center pt-4 border-t border-gray-100 mt-4">
                    <button
                      onClick={toggleSessionView}
                      className="text-sm text-[#482F60] hover:text-[#3d2651] font-medium transition-colors"
                    >
                      ← Back to Cycle {currentCycleNumber}
                    </button>
                  </div>
                );
              } else if (additionalNotes > 0) {
                // Show "show more" button only if there are additional notes
                return (
                  <div className="text-center pt-4 border-t border-gray-100 mt-4">
                    <button
                      onClick={toggleSessionView}
                      className="text-sm text-[#482F60] hover:text-[#3d2651] font-medium transition-colors"
                    >
                      Show more from this session ({additionalNotes})
                    </button>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}