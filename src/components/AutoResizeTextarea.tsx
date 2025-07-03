import React, { useRef, useEffect } from 'react';

interface AutoResizeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
}

export function AutoResizeTextarea({ 
  value, 
  onChange, 
  placeholder, 
  className = "w-full p-3 border border-gray-200 rounded-lg resize-none focus:ring-1 focus:ring-[#482F60] focus:border-[#482F60] transition-colors text-sm",
  rows = 2,
  ...props 
}: AutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  // Auto-resize when value changes programmatically
  useEffect(() => {
    autoResize();
  }, [value]);

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    autoResize();
    // Call original onInput if provided
    if (props.onInput) {
      props.onInput(e);
    }
  };

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      rows={rows}
      onInput={handleInput}
      style={{ overflow: 'hidden' }}
      {...props}
    />
  );
} 