import React, { useState } from 'react';
import { ArrowRight, Lightbulb, Target } from 'lucide-react';
import { BackButton } from '../components/BackButton';
import { useWorkCyclesStore } from '../store/useWorkCyclesStore';
import { VoiceRecorder } from '../components/VoiceRecorder';
import type { CycleData, EnergyLevel, MoraleLevel } from '../types';

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
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cycleData.goal.trim() || !cycleData.energy || !cycleData.morale) return;
    startCycle(cycleData);
  };
  
  const handleVoiceComplete = (transcript: string) => {
    // In a real implementation, this would be processed by AI to fill the form
    // For now, we'll just put it in the goal field as an example
    setCycleData(prev => ({ 
      ...prev, 
      goal: prev.goal + (prev.goal ? '\n\n' : '') + transcript 
    }));
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
          <VoiceRecorder onComplete={handleVoiceComplete} />
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cycle preparation */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-2 text-lg">Cycle Preparation</h3>
            <p className="text-gray-600 text-xs mb-3">
              Set your focus and assess your current state before starting.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block font-medium text-gray-900 mb-2">
                  What am I trying to accomplish this cycle? <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={cycleData.goal}
                  onChange={(e) => setCycleData(prev => ({ ...prev, goal: e.target.value }))}
                  placeholder="Be specific about what you want to achieve in the next 30 minutes..."
                  className="w-full p-3 border border-gray-200 rounded-lg resize-none focus:ring-1 focus:ring-[#482F60] focus:border-[#482F60] transition-colors text-sm"
                  rows={2}
                />
              </div>
              
              <div>
                <label className="block font-medium text-gray-900 mb-2">
                  How will I get started?
                </label>
                <textarea
                  value={cycleData.firstStep}
                  onChange={(e) => setCycleData(prev => ({ ...prev, firstStep: e.target.value }))}
                  placeholder="What's your first step? How will you begin..."
                  className="w-full p-3 border border-gray-200 rounded-lg resize-none focus:ring-1 focus:ring-[#482F60] focus:border-[#482F60] transition-colors text-sm"
                  rows={2}
                />
              </div>
              
              <div>
                <label className="block font-medium text-gray-900 mb-2">
                  Any hazards present?
                </label>
                <textarea
                  value={cycleData.hazards}
                  onChange={(e) => setCycleData(prev => ({ ...prev, hazards: e.target.value }))}
                  placeholder="What might distract you or slow you down in this cycle..."
                  className="w-full p-3 border border-gray-200 rounded-lg resize-none focus:ring-1 focus:ring-[#482F60] focus:border-[#482F60] transition-colors text-sm"
                  rows={2}
                />
              </div>
            </div>
          </div>
          
          {/* Energy and morale */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-gray-900 mb-2 text-sm flex items-center gap-1">
                  <span className="text-yellow-500">⚡</span>
                  Energy Level <span className="text-red-500">*</span>
                </label>
                <select
                  value={cycleData.energy}
                  onChange={(e) => setCycleData(prev => ({ ...prev, energy: e.target.value as EnergyLevel }))}
                  className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#482F60] focus:border-[#482F60] transition-colors text-sm"
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
                </label>
                <select
                  value={cycleData.morale}
                  onChange={(e) => setCycleData(prev => ({ ...prev, morale: e.target.value as MoraleLevel }))}
                  className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#482F60] focus:border-[#482F60] transition-colors text-sm"
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
        <div className="mt-6 bg-gray-50 rounded-2xl p-4">
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
        </div>
      </div>
    </div>
  );
}