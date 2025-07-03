import React from 'react';
import { AutoResizeTextarea } from './AutoResizeTextarea';

interface LabelledTextAreaProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  textareaClassName?: string;
  rows?: number;
  isAiFilled?: boolean;
  showSparkle?: boolean;
}

export function LabelledTextArea({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  className = "",
  textareaClassName,
  rows = 2,
  isAiFilled = false,
  showSparkle = false,
  ...props
}: LabelledTextAreaProps) {
  // Build textarea className with AI-filled styling
  const getTextareaClassName = () => {
    const baseClass = textareaClassName || "w-full p-3 border border-gray-200 rounded-lg resize-none focus:ring-1 focus:ring-[#6366f1] focus:border-[#6366f1] transition-colors text-sm";
    const aiFilledClass = isAiFilled ? "ai-filled-glow" : "";
    return `${baseClass} ${aiFilledClass}`;
  };

  return (
    <div className={className}>
      <label className="block font-medium text-gray-900 mb-1 text-sm flex items-center gap-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
        {showSparkle && (
          <span className="sparkle-icon animate-pulse text-green-500">✨</span>
        )}
      </label>
      <AutoResizeTextarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={getTextareaClassName()}
        rows={rows}
        {...props}
      />
    </div>
  );
} 