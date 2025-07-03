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
  ...props
}: LabelledTextAreaProps) {
  return (
    <div className={className}>
      <label className="block font-medium text-gray-900 mb-1 text-sm">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <AutoResizeTextarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={textareaClassName}
        rows={rows}
        {...props}
      />
    </div>
  );
} 