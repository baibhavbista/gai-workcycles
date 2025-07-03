import React, { useState } from 'react';
import { CheckCircle, ArrowRight } from 'lucide-react';
import { useWorkCyclesStore } from '../store/useWorkCyclesStore';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { BackButton } from '../components/BackButton';
import { isElectron, saveSessionReview } from '../electron-ipc';
import { LabelledTextArea } from '../components/LabelledTextArea';
import { mergeDataOnVoiceComplete, type QuestionSpec } from '../client-side-ai';

// Schema for auto-filling via VoiceRecorder
const formSchema: QuestionSpec[] = [
  { key: 'accomplishments', question: 'What did I get done in this session?' },
  { key: 'comparison',      question: 'How did this compare to my normal work output?' },
  { key: 'obstacles',       question: 'Did I get bogged down? Where?' },
  { key: 'successes',       question: 'What went well? How can I replicate this in the future?' },
  { key: 'takeaways',       question: 'Any other takeaways? Lessons to share with others?' },
];

export function SessionReviewScreen() {
  const { currentSession, completeSession } = useWorkCyclesStore();
  const [review, setReview] = useState({
    accomplishments: '',
    comparison: '',
    obstacles: '',
    successes: '',
    takeaways: '',
  });
  
  const handleComplete = async () => {
    if (isElectron()) {
      await saveSessionReview(currentSession!.id, review);
    }
    completeSession();
  };

  const handleVoiceComplete = (transcript: string, filled?: Record<string, string>) => {
    mergeDataOnVoiceComplete(setReview, formSchema, transcript, filled);
    console.log('new review:', review);
  };
  
  if (!currentSession) return null;
  
  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <BackButton />
          <div className="text-center flex-1">
            <div className="inline-flex items-center justify-center w-10 h-10 bg-green-100 rounded-full mb-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-1">Session Review</h1>
            <p className="text-gray-600 text-sm">
              Reflect on your entire session to extract insights and improve future performance.
            </p>
          </div>
          <VoiceRecorder formSchema={formSchema} onComplete={handleVoiceComplete} />
        </div>
        
        {/* Review form */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
          <h3 className="font-semibold text-gray-900 mb-2 text-lg">Final Reflection</h3>
          <p className="text-gray-600 text-xs mb-4">
            Take time to process what you've accomplished and learned.
          </p>
          
          <div className="space-y-4">
            <LabelledTextArea
              label="What did I get done in this session?"
              value={review.accomplishments}
              onChange={(e) => setReview(prev => ({ ...prev, accomplishments: e.target.value }))}
              // TODO: if user has a bunch of work notes, add suggested summary from all work notes from this session
              textareaClassName="w-full p-3 border border-gray-200 rounded-lg resize-none focus:ring-1 focus:ring-[#6366f1] focus:border-[#6366f1] transition-colors text-sm"
            />
            
            <LabelledTextArea
              label="How did this compare to my normal work output?"
              value={review.comparison}
              onChange={(e) => setReview(prev => ({ ...prev, comparison: e.target.value }))}
              textareaClassName="w-full p-3 border border-gray-200 rounded-lg resize-none focus:ring-1 focus:ring-[#6366f1] focus:border-[#6366f1] transition-colors text-sm"
            />
            
            <LabelledTextArea
              label="Did I get bogged down? Where?"
              value={review.obstacles}
              onChange={(e) => setReview(prev => ({ ...prev, obstacles: e.target.value }))}
              textareaClassName="w-full p-3 border border-gray-200 rounded-lg resize-none focus:ring-1 focus:ring-[#6366f1] focus:border-[#6366f1] transition-colors text-sm"
            />
            
            <LabelledTextArea
              label="What went well? How can I replicate this in the future?"
              value={review.successes}
              onChange={(e) => setReview(prev => ({ ...prev, successes: e.target.value }))}
              textareaClassName="w-full p-3 border border-gray-200 rounded-lg resize-none focus:ring-1 focus:ring-[#6366f1] focus:border-[#6366f1] transition-colors text-sm"
            />
            
            <LabelledTextArea
              label="Any other takeaways? Lessons to share with others?"
              value={review.takeaways}
              onChange={(e) => setReview(prev => ({ ...prev, takeaways: e.target.value }))}
              textareaClassName="w-full p-3 border border-gray-200 rounded-lg resize-none focus:ring-1 focus:ring-[#6366f1] focus:border-[#6366f1] transition-colors text-sm"
            />
          </div>
        </div>
        
        {/* Complete button */}
        <button
          onClick={handleComplete}
          className="w-full py-3 px-4 bg-[#6366f1] text-white rounded-xl font-medium hover:bg-[#5855eb] transition-colors duration-200 flex items-center justify-center gap-2"
        >
          <ArrowRight className="w-5 h-5" />
          Complete Session
        </button>
      </div>
    </div>
  );
}