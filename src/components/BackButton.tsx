import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useWorkCyclesStore } from '../store/useWorkCyclesStore';

export function BackButton() {
  const { goBack } = useWorkCyclesStore();
  return (
    <button
      onClick={goBack}
      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
      aria-label="Back"
    >
      <ArrowLeft className="w-5 h-5 text-gray-600" />
    </button>
  );
} 