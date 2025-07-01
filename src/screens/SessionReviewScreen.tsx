import React, { useState } from 'react';
import { CheckCircle, ArrowRight } from 'lucide-react';
import { useWorkCyclesStore } from '../store/useWorkCyclesStore';
import { VoiceRecorder } from '../components/VoiceRecorder';

export function SessionReviewScreen() {
  const { currentSession, completeSession } = useWorkCyclesStore();
  const [review, setReview] = useState({
    accomplishments: '',
    comparison: '',
    obstacles: '',
    successes: '',
    takeaways: '',
  });
  
  const handleComplete = () => {
    completeSession();
  };
  
  const handleVoiceComplete = (transcript: string) => {
    // In a real implementation, this would be processed by AI to fill the form
    // For now, we'll just put it in the accomplishments field as an example
    setReview(prev => ({ 
      ...prev, 
      accomplishments: prev.accomplishments + (prev.accomplishments ? '\n\n' : '') + transcript 
    }));
  };
  
  if (!currentSession) return null;
  
  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="text-center flex-1">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-4">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Session Review</h1>
            <p className="text-gray-600">
              Reflect on your entire session to extract insights and improve future performance.
            </p>
          </div>
          <VoiceRecorder onComplete={handleVoiceComplete} />
        </div>
        
        {/* Review form */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-2">Final Reflection</h3>
          <p className="text-gray-600 text-sm mb-6">
            Take time to process what you've accomplished and learned.
          </p>
          
          <div className="space-y-6">
            <div>
              <label className="block font-medium text-gray-900 mb-2">
                What did I get done in this session?
              </label>
              <textarea
                value={review.accomplishments}
                onChange={(e) => setReview(prev => ({ ...prev, accomplishments: e.target.value }))}
                placeholder="List your key accomplishments and completed tasks..."
                className="w-full p-4 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-[#6366f1] focus:border-[#6366f1] transition-colors"
                rows={3}
              />
            </div>
            
            <div>
              <label className="block font-medium text-gray-900 mb-2">
                How did this compare to my normal work output?
              </label>
              <textarea
                value={review.comparison}
                onChange={(e) => setReview(prev => ({ ...prev, comparison: e.target.value }))}
                placeholder="Was this more or less productive than usual? Why..."
                className="w-full p-4 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-[#6366f1] focus:border-[#6366f1] transition-colors"
                rows={3}
              />
            </div>
            
            <div>
              <label className="block font-medium text-gray-900 mb-2">
                Did I get bogged down? Where?
              </label>
              <textarea
                value={review.obstacles}
                onChange={(e) => setReview(prev => ({ ...prev, obstacles: e.target.value }))}
                placeholder="Any areas where progress slowed or stopped..."
                className="w-full p-4 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-[#6366f1] focus:border-[#6366f1] transition-colors"
                rows={3}
              />
            </div>
            
            <div>
              <label className="block font-medium text-gray-900 mb-2">
                What went well? How can I replicate this in the future?
              </label>
              <textarea
                value={review.successes}
                onChange={(e) => setReview(prev => ({ ...prev, successes: e.target.value }))}
                placeholder="Identify what worked and how to do more of it..."
                className="w-full p-4 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-[#6366f1] focus:border-[#6366f1] transition-colors"
                rows={3}
              />
            </div>
            
            <div>
              <label className="block font-medium text-gray-900 mb-2">
                Any other takeaways? Lessons to share with others?
              </label>
              <textarea
                value={review.takeaways}
                onChange={(e) => setReview(prev => ({ ...prev, takeaways: e.target.value }))}
                placeholder="Broader insights, patterns, or wisdom from this session..."
                className="w-full p-4 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-[#6366f1] focus:border-[#6366f1] transition-colors"
                rows={3}
              />
            </div>
          </div>
        </div>
        
        {/* Complete button */}
        <button
          onClick={handleComplete}
          className="w-full py-4 px-6 bg-[#6366f1] text-white rounded-xl font-medium hover:bg-[#5855eb] transition-colors duration-200 flex items-center justify-center gap-2"
        >
          <ArrowRight className="w-5 h-5" />
          Complete Session
        </button>
      </div>
    </div>
  );
}