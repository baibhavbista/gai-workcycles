import React, { useState } from 'react';
import { ArrowRight, Lightbulb, Target } from 'lucide-react';
import { BackButton } from '../components/BackButton';
import { useWorkCyclesStore } from '../store/useWorkCyclesStore';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { LabelledTextArea } from '../components/LabelledTextArea';
import type { CycleData, EnergyLevel, MoraleLevel } from '../types';
import { mergeDataOnVoiceComplete, type QuestionSpec } from '../client-side-ai';

// Schema for auto-filling via VoiceRecorder
const formSchema: QuestionSpec[] = [
  { key: 'goal',        question: 'What am I trying to accomplish this cycle?' },
  { key: 'firstStep',   question: 'How will I get started?' },
  { key: 'hazards',     question: 'Any hazards present?' },
  { key: 'energy',      question: 'What is my energy level?', enum: ['High', 'Medium', 'Low'] },
  { key: 'morale',      question: 'What is my morale level?', enum: ['High', 'Medium', 'Low'] },
];

export function PreCycleScreen() {
  const { currentSession, startCycle } = useWorkCyclesStore();
  const [cycleData, setCycleData] = useState({
    goal: '',
    firstStep: '',
    hazards: '',
    energy: '' as EnergyLevel,
    morale: '' as MoraleLevel,
    noteworthy: '',
    distractions: '',
    improvement: '',
  });
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set());
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cycleData.goal.trim() || !cycleData.energy || !cycleData.morale) return;
    startCycle(cycleData);
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
    mergeDataOnVoiceComplete(setCycleData, formSchema, transcript, filled, markFieldAsAiFilled);
    console.log('new cycle data', cycleData);
  };
  
  const isValid = cycleData.goal.trim().length > 0 && cycleData.energy && cycleData.morale;
  const currentCycleNumber = (currentSession?.currentCycleIdx || 0) + 1;
  
  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <BackButton />
          <div className="text-center flex-1">
            <div className="inline-flex items-center justify-center px-3 py-1.5 bg-[#482F60] text-white rounded-full text-xs font-medium mb-3">
              Cycle {currentCycleNumber}
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-1">Pre-Cycle Planning</h1>
            <p className="text-gray-600 text-sm">
              Take a moment to plan your approach for this {currentSession?.intentions.workMinutes || 30}-minute cycle.
            </p>
          </div>
          <VoiceRecorder formSchema={formSchema} onComplete={handleVoiceComplete} />
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cycle preparation */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-2 text-lg">Cycle Preparation</h3>
            <p className="text-gray-600 text-xs mb-3">
              Set your focus and assess your current state before starting.
            </p>
            
            <div className="space-y-4">
              <LabelledTextArea
                label="What am I trying to accomplish this cycle?"
                value={cycleData.goal}
                onChange={(e) => setCycleData(prev => ({ ...prev, goal: e.target.value }))}
                required
                isAiFilled={aiFilledFields.has('goal')}
                showSparkle={aiFilledFields.has('goal')}
              />
              
              <LabelledTextArea
                label="How will I get started?"
                value={cycleData.firstStep}
                onChange={(e) => setCycleData(prev => ({ ...prev, firstStep: e.target.value }))}
                isAiFilled={aiFilledFields.has('firstStep')}
                showSparkle={aiFilledFields.has('firstStep')}
              />
              
              <LabelledTextArea
                label="Any hazards present?"
                value={cycleData.hazards}
                onChange={(e) => setCycleData(prev => ({ ...prev, hazards: e.target.value }))}
                isAiFilled={aiFilledFields.has('hazards')}
                showSparkle={aiFilledFields.has('hazards')}
              />
            </div>
          </div>
          
          {/* Energy and morale */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-gray-900 mb-2 text-sm flex items-center gap-1">
                  <span className="text-yellow-500">⚡</span>
                  Energy Level <span className="text-red-500">*</span>
                  {aiFilledFields.has('energy') && (
                    <span className="sparkle-icon animate-pulse text-green-500">✨</span>
                  )}
                </label>
                <select
                  value={cycleData.energy}
                  onChange={(e) => setCycleData(prev => ({ ...prev, energy: e.target.value as EnergyLevel }))}
                  className={`w-full p-2.5 border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#482F60] focus:border-[#482F60] transition-colors text-sm ${
                    aiFilledFields.has('energy') ? 'ai-filled-glow' : ''
                  }`}
                >
                  <option value="">Select energy level</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              
              <div>
                <label className="block font-medium text-gray-900 mb-2 text-sm flex items-center gap-1">
                  <span className="text-red-500">❤️</span>
                  Morale Level <span className="text-red-500">*</span>
                  {aiFilledFields.has('morale') && (
                    <span className="sparkle-icon animate-pulse text-green-500">✨</span>
                  )}
                </label>
                <select
                  value={cycleData.morale}
                  onChange={(e) => setCycleData(prev => ({ ...prev, morale: e.target.value as MoraleLevel }))}
                  className={`w-full p-2.5 border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#482F60] focus:border-[#482F60] transition-colors text-sm ${
                    aiFilledFields.has('morale') ? 'ai-filled-glow' : ''
                  }`}
                >
                  <option value="">Select morale level</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>
          </div>
          
          {/* Submit button */}
          <button
            type="submit"
            disabled={!isValid}
            className={`w-full py-4 px-6 rounded-xl font-medium flex items-center justify-center gap-2 transition-all duration-200 ${
              isValid
                ? 'bg-[#482F60] text-white hover:bg-[#3d2651] shadow-sm'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <ArrowRight className="w-5 h-5" />
            Start Cycle Timer
          </button>
        </form>
        
        {/* Tips */}
        {/* <div className="mt-6 bg-gray-50 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-[#482F60] flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Tips for Better Cycles</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Be specific about your goal - "Write 500 words" vs "Work on article"</li>
                <li>• Plan your first action to avoid starting friction</li>
                <li>• Identify potential distractions beforehand</li>
                <li>• Your energy/morale helps track patterns over time</li>
              </ul>
            </div>
          </div>
        </div> */}
      </div>
    </div>
  );
}