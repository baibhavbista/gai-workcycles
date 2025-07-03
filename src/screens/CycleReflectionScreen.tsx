import React, { useState } from 'react';
import { ArrowRight, Target, Coffee, Square } from 'lucide-react';
import { useWorkCyclesStore } from '../store/useWorkCyclesStore';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { LabelledTextArea } from '../components/LabelledTextArea';
import type { CycleStatus } from '../types';
import { BackButton } from '../components/BackButton';
import { mergeDataOnVoiceComplete, type QuestionSpec } from '../client-side-ai';

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
  
  const handleSubmit = (action: 'break' | 'finish') => {
    completeCycle(reflection);
  };


  const handleVoiceComplete = (transcript: string, filled?: Record<string, string>) => {
    mergeDataOnVoiceComplete(setReflection, formSchema, transcript, filled);
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
                placeholder="Any insights, breakthroughs, or notable observations..."
              />
              
              <LabelledTextArea
                label="Any distractions?"
                value={reflection.distractions}
                onChange={(e) => setReflection(prev => ({ ...prev, distractions: e.target.value }))}
                placeholder="What pulled your attention away from the task..."
              />
              
              <LabelledTextArea
                label="Things to improve for next cycle?"
                value={reflection.improvement}
                onChange={(e) => setReflection(prev => ({ ...prev, improvement: e.target.value }))}
                placeholder="What would help you be more effective next time..."
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