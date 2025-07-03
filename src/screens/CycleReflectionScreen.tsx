import React, { useState, useEffect } from 'react';
import { ArrowRight, Target, Coffee, Square, Loader2 } from 'lucide-react';
import { useWorkCyclesStore } from '../store/useWorkCyclesStore';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { LabelledTextArea } from '../components/LabelledTextArea';
import { AutoResizeTextarea } from '../components/AutoResizeTextarea';
import type { CycleStatus } from '../types';
import { BackButton } from '../components/BackButton';
import { mergeDataOnVoiceComplete, analyzeDistractions, type QuestionSpec } from '../client-side-ai';
import { getCycleNotes, getOpenAIKey, isElectron, getSettings } from '../electron-ipc';

// Schema for auto-filling via VoiceRecorder
const formSchema: QuestionSpec[] = [
  { key: 'status',        question: 'Did I complete the cycle\'s target?', enum: ['hit', 'partial', 'miss'] },
  { key: 'noteworthy',    question: 'Anything noteworthy?' },
  { key: 'distractions',  question: 'Any distractions?' },
  { key: 'improvement',   question: 'Things to improve for next cycle?' },
];

export function CycleReflectionScreen() {
  const { currentCycle, currentSession, completeCycle } = useWorkCyclesStore();
  const [reflection, setReflection] = useState({
    status: '' as CycleStatus,
    noteworthy: '',
    distractions: '',
    improvement: '',
  });
  const [isAnalyzingDistractions, setIsAnalyzingDistractions] = useState(false);
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set());
  
  // Auto-analyze distractions on component mount
  useEffect(() => {
    const analyzeDistractionNotes = async () => {
      // Validation checks
      if (!isElectron() || !currentSession || !currentCycle) return;

      try {
        // Check if AI is enabled and API key exists
        const [settings, apiKey] = await Promise.all([
          getSettings(),
          getOpenAIKey()
        ]);

        if (!settings?.aiEnabled || !apiKey) return;

        // Start analysis
        setIsAnalyzingDistractions(true);

        // Fetch current cycle notes
        const cycleNotes = await getCycleNotes(currentSession.id, currentCycle.id);
        const distractionNotes = cycleNotes
          .filter(note => note.noteType === 'distraction')
          .map(note => ({
            text: note.text,
            timestamp: note.timestamp
          }));

        // only continue if we actually have distractionNotes
        if (distractionNotes.length === 0) {
          setIsAnalyzingDistractions(false);
          return;
        }

        // Analyze distractions
        const analysis = await analyzeDistractions(distractionNotes, apiKey);
        
        // do not set the result if prev.distractions already has data
        setReflection(prev => {
          // if prev.distractions is not a string
          if (!prev.distractions || typeof prev.distractions !== 'string' || prev.distractions.trim() === '') {
            // Mark as AI-filled
            markFieldAsAiFilled('distractions');
            return {
              ...prev, 
              distractions: analysis
            };
          } else {
            return prev;
          }
        });

      } catch (error) {
        console.error('Failed to analyze distractions:', error);
        // Fail silently - user can still manually input
      } finally {
        setIsAnalyzingDistractions(false);
      }
    };

    analyzeDistractionNotes();
  }, [currentSession?.id, currentCycle?.id]);

  const handleSubmit = (action: 'break' | 'finish') => {
    completeCycle(reflection);
  };


  // Mark field as AI-filled with auto-clear after 3 seconds
  const markFieldAsAiFilled = (fieldKey: string) => {
    setAiFilledFields(prev => new Set(prev).add(fieldKey));
    
    setTimeout(() => {
      setAiFilledFields(prev => {
        const newSet = new Set(prev);
        newSet.delete(fieldKey);
        return newSet;
      });
    }, 3000);
  };

  const handleVoiceComplete = (transcript: string, filled?: Record<string, string>) => {
    mergeDataOnVoiceComplete(setReflection, formSchema, transcript, filled, markFieldAsAiFilled);
    console.log('new reflection:', reflection);
  };
  
  const currentCycleNumber = (currentCycle?.idx || 0) + 1;
  const isLastCycle = currentSession && currentCycleNumber >= currentSession.intentions.cyclesPlanned;
  
  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <BackButton />
          <div className="text-center flex-1">
            <div className="inline-flex items-center justify-center px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-xs font-medium mb-3">
              Cycle {currentCycleNumber} Complete
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-1">Cycle Reflection</h1>
            <p className="text-gray-600 text-sm">
              Take a moment to reflect on what happened during this cycle.
            </p>
          </div>
          <VoiceRecorder formSchema={formSchema} onComplete={handleVoiceComplete} />
        </div>
        
        {/* Goal reminder */}
        {currentCycle?.goal && (
          <div className="bg-gray-50 rounded-2xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <Target className="w-5 h-5 text-[#482F60] flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-[#482F60] mb-1">Your Goal for This Cycle</h3>
                <p className="text-gray-700 text-sm">{currentCycle.goal}</p>
              </div>
            </div>
          </div>
        )}
        
        <div className="space-y-4">
          {/* Post-cycle review */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-2 text-lg">Post-Cycle Review</h3>
            <p className="text-gray-600 text-xs mb-3">
              Honest reflection helps you improve and learn from each cycle.
            </p>
            
            <div className="space-y-1">
              <div>
                <label className="block font-medium text-gray-900 mb-3">
                  Completed cycle's target?
                </label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="status"
                      value="hit"
                      checked={reflection.status === 'hit'}
                      onChange={(e) => setReflection(prev => ({ ...prev, status: e.target.value as CycleStatus }))}
                      className="w-4 h-4 text-[#482F60] border-gray-300 focus:ring-[#482F60]"
                    />
                    <span className="ml-1 text-gray-700 text-sm">Yes</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="status"
                      value="partial"
                      checked={reflection.status === 'partial'}
                      onChange={(e) => setReflection(prev => ({ ...prev, status: e.target.value as CycleStatus }))}
                      className="w-4 h-4 text-[#482F60] border-gray-300 focus:ring-[#482F60]"
                    />
                    <span className="ml-1 text-gray-700 text-sm">Partially</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="status"
                      value="miss"
                      checked={reflection.status === 'miss'}
                      onChange={(e) => setReflection(prev => ({ ...prev, status: e.target.value as CycleStatus }))}
                      className="w-4 h-4 text-[#482F60] border-gray-300 focus:ring-[#482F60]"
                    />
                    <span className="ml-1 text-gray-700 text-sm">No</span>
                  </label>
                </div>
              </div>
              
              <LabelledTextArea
                label="Anything noteworthy?"
                value={reflection.noteworthy}
                onChange={(e) => setReflection(prev => ({ ...prev, noteworthy: e.target.value }))}
                isAiFilled={aiFilledFields.has('noteworthy')}
                showSparkle={aiFilledFields.has('noteworthy')}
              />
              
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <label className="block font-medium text-gray-900 text-sm">
                    {isAnalyzingDistractions ? 'Analyzing distractions...' : 'Any distractions?'}
                  </label>
                  {isAnalyzingDistractions && (
                    <Loader2 className="w-4 h-4 text-[#482F60] animate-spin" />
                  )}
                  {aiFilledFields.has('distractions') && (
                    <span className="sparkle-icon animate-pulse text-green-500">✨</span>
                  )}
                </div>
                <AutoResizeTextarea
                  value={reflection.distractions}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReflection(prev => ({ ...prev, distractions: e.target.value }))}
                  placeholder={isAnalyzingDistractions 
                    ? "AI is analyzing your distraction notes..." 
                    : "What pulled your attention away from the task..."
                  }
                  disabled={isAnalyzingDistractions}
                  className={`w-full p-3 border border-gray-200 rounded-lg resize-none focus:ring-1 focus:ring-[#6366f1] focus:border-[#6366f1] transition-colors text-sm min-h-[80px] ${
                    isAnalyzingDistractions ? 'bg-gray-50 cursor-wait' : ''
                  } ${aiFilledFields.has('distractions') ? 'ai-filled-glow' : ''}`}
                  rows={4}
                />
              </div>
              
              <LabelledTextArea
                label="Things to improve for next cycle?"
                value={reflection.improvement}
                onChange={(e) => setReflection(prev => ({ ...prev, improvement: e.target.value }))}
                isAiFilled={aiFilledFields.has('improvement')}
                showSparkle={aiFilledFields.has('improvement')}
              />
            </div>
          </div>
          
          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleSubmit('finish')}
              className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-gray-200 hover:bg-gray-50 transition-colors duration-200 text-sm"
            >
              <Square className="w-6 h-6 text-gray-600 mb-2" />
              <span className="font-medium text-gray-900">Finish Session</span>
              <span className="text-sm text-gray-500">Complete and review</span>
            </button>
            
            <button
              onClick={() => handleSubmit('break')}
              className="flex flex-col items-center justify-center p-4 bg-[#482F60] text-white rounded-2xl hover:bg-[#3d2651] transition-colors duration-200 text-sm"
            >
              <Coffee className="w-6 h-6 mb-2" />
              <span className="font-medium">Take a Break</span>
              <span className="text-sm text-purple-200">
                {currentSession?.intentions.breakMinutes || 5} minutes, then next cycle
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}