import React, { useState, useEffect } from 'react';
import { ArrowRight, Target, ChevronRight, ChevronDown } from 'lucide-react';
import { useWorkCyclesStore } from '../store/useWorkCyclesStore';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { LabelledTextArea } from '../components/LabelledTextArea';
import type { SessionIntentions } from '../types';
import { type QuestionSpec, mergeDataOnVoiceComplete } from '../client-side-ai';
import { BackButton } from '../components/BackButton';

// Schema for auto-filling via VoiceRecorder
// TODO: use this value in the UI and also add a metadata.label (also do this in the other screens)
const formSchema: QuestionSpec[] = [
  { key: 'objective',        question: 'What am I trying to accomplish?' },
  { key: 'importance',       question: 'Why is this important and valuable?' },
  { key: 'definitionOfDone', question: 'How will I know this is complete?' },
  { key: 'hazards',          question: 'Any risks / hazards? (Potential distractions, procrastination, etc.)' },
  { key: 'miscNotes',        question: 'Anything else noteworthy?'},
  { key: 'concrete',         question: 'Is this concrete or measurable? (rather than subjective / ambiguous)', type: 'boolean' },
];

// map from key->question
const keyToSpec = formSchema.reduce((acc, spec) => {
  acc[spec.key] = spec;
  return acc;
}, {} as Record<string, QuestionSpec>);

export function SessionIntentionsScreen() {
  const { setScreen, startNewSession, settings } = useWorkCyclesStore();

  const [intentions, setIntentions] = useState<SessionIntentions>(() => ({
    objective: '',
    importance: '',
    definitionOfDone: '',
    hazards: '',
    concrete: false,
    workMinutes: settings?.workMinutes ?? 30,
    breakMinutes: settings?.breakMinutes ?? 5,
    cyclesPlanned: settings?.cyclesPlanned ?? 6,
    miscNotes: '',
  }));
  const [showSettings, setShowSettings] = useState(false);
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set());

  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!intentions.objective.trim()) return;
    startNewSession(intentions);
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
    mergeDataOnVoiceComplete(setIntentions, formSchema, transcript, filled, markFieldAsAiFilled);
    console.log('new intentions', intentions);
  };
  
  const isValid = intentions.objective.trim().length > 0;
  
  const getSuccessRate = (session: any) => {
    if (!session.cycles?.length) return 0;
    const hits = session.cycles.filter((c: any) => c.status === 'hit').length;
    return Math.round((hits / session.cycles.length) * 100);
  };
  
  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <BackButton />
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">Session Prep</h1>
          </div>
          <VoiceRecorder formSchema={formSchema} onComplete={handleVoiceComplete} />
        </div>
        
        <p className="text-gray-600 text-center mb-4 text-sm">
          {(() => {
            const totalHours = ((intentions.workMinutes + intentions.breakMinutes) * intentions.cyclesPlanned) / 60;
            const pretty = Number.isInteger(totalHours) ? totalHours.toString() : totalHours.toFixed(1);
            return `Take a few minutes to prepare, so that your next ${pretty} hour${totalHours === 1 ? '' : 's'} are effective`;
          })()}
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Main objective */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3 text-lg">Set Your Intentions</h3>
            
            <div className="space-y-4">
              <LabelledTextArea
                label="What am I trying to accomplish?"
                value={intentions.objective}
                onChange={(e) => setIntentions(prev => ({ ...prev, objective: e.target.value }))}
                isAiFilled={aiFilledFields.has('objective')}
                showSparkle={aiFilledFields.has('objective')}
              />
              
              <LabelledTextArea
                label="Why is this important and valuable?"
                value={intentions.importance}
                onChange={(e) => setIntentions(prev => ({ ...prev, importance: e.target.value }))}
                isAiFilled={aiFilledFields.has('importance')}
                showSparkle={aiFilledFields.has('importance')}
              />
              
              <LabelledTextArea
                label="How will I know this is complete?"
                value={intentions.definitionOfDone}
                onChange={(e) => setIntentions(prev => ({ ...prev, definitionOfDone: e.target.value }))}
                isAiFilled={aiFilledFields.has('definitionOfDone')}
                showSparkle={aiFilledFields.has('definitionOfDone')}
              />
              
              <LabelledTextArea
                label="Any risks / hazards? Potential distractions, procrastination, etc."
                value={intentions.hazards}
                onChange={(e) => setIntentions(prev => ({ ...prev, hazards: e.target.value }))}
                isAiFilled={aiFilledFields.has('hazards')}
                showSparkle={aiFilledFields.has('hazards')}
              />
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="concrete"
                  checked={intentions.concrete}
                  onChange={(e) => setIntentions(prev => ({ ...prev, concrete: e.target.checked }))}
                  className="w-5 h-5 text-[#482F60] border-gray-300 rounded focus:ring-[#482F60]"
                />
                <label htmlFor="concrete" className="text-gray-700 text-sm">
                  <span className="font-medium">Is this concrete / measurable or subjective / ambiguous?</span>
                  {/* <div className="text-xs text-gray-500">
                    If not, maybe update above to have clear, measurable outcomes
                  </div> */}
                </label>
              </div>

              <LabelledTextArea
                label="Anything else noteworthy?"
                value={intentions.miscNotes}
                onChange={(e) => setIntentions(prev => ({ ...prev, miscNotes: e.target.value }))}
                isAiFilled={aiFilledFields.has('miscNotes')}
                showSparkle={aiFilledFields.has('miscNotes')}
              />
            </div>
          </div>
          
          {/* Session settings - collapsible */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-2xl"
            >
              <div className="text-left">
                <h3 className="font-semibold text-gray-900">Session Settings</h3>
                <p className="text-xs text-gray-600">
                  30min cycles, 5min breaks, 6 cycles (recommended defaults)
                </p>
              </div>
              {showSettings ? (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-400" />
              )}
            </button>
            
            {showSettings && (
              <div className="px-4 pb-4 border-t border-gray-100">
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Work minutes
                    </label>
                    <input
                      type="number"
                      value={intentions.workMinutes}
                      onChange={(e) => setIntentions(prev => ({ ...prev, workMinutes: parseInt(e.target.value) || 30 }))}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#482F60] focus:border-[#482F60] transition-colors"
                      min="1"
                      max="60"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Break minutes
                    </label>
                    <input
                      type="number"
                      value={intentions.breakMinutes}
                      onChange={(e) => setIntentions(prev => ({ ...prev, breakMinutes: parseInt(e.target.value) || 5 }))}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#482F60] focus:border-[#482F60] transition-colors"
                      min="1"
                      max="30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Cycles
                    </label>
                    <input
                      type="number"
                      value={intentions.cyclesPlanned}
                      onChange={(e) => setIntentions(prev => ({ ...prev, cyclesPlanned: parseInt(e.target.value) || 6 }))}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#482F60] focus:border-[#482F60] transition-colors"
                      min="1"
                      max="12"
                    />
                  </div>
                </div>
                <div className="mt-3 p-2 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-600 leading-snug">
                    <strong>Tip:</strong> The default settings (30min work, 5min break, 6 cycles) are based on 
                    proven productivity research. Only change these if you have specific requirements.
                  </p>
                </div>
              </div>
            )}
          </div>
          
          {/* Submit button */}
          <button
            type="submit"
            disabled={!isValid}
            className={`w-full py-3 px-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all duration-200 ${
              isValid
                ? 'bg-[#482F60] text-white hover:bg-[#3d2651] shadow-sm'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <ArrowRight className="w-5 h-5" />
            Start First Cycle
          </button>
        </form>
      </div>
    </div>
  );
}