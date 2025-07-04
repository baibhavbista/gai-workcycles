import React, { useEffect, useState, useRef } from 'react';
import { useChatStore } from '../store/useChatStore';
import { Bot, User } from 'lucide-react';
import { agentOnResponse } from '../electron-ipc';
import { ChatMessage } from '../types';

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.type === 'user';
  return (
    <div className={`flex items-start gap-3 my-4 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
          <Bot className="w-5 h-5 text-gray-600" />
        </div>
      )}
      <div className={`p-3 rounded-2xl max-w-lg ${isUser ? 'bg-[#482F60] text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'}`}>
        <p className="text-sm">{message.content}</p>
      </div>
       {isUser && (
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
          <User className="w-5 h-5 text-gray-600" />
        </div>
      )}
    </div>
  );
}

export function AnalystChatModal() {
  const { isChatOpen, toggleChat, messages, sendMessage, addMessage, isThinking, setThinking } = useChatStore();
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    const cleanup = agentOnResponse((response) => {
      setThinking(false);
      addMessage({
        id: crypto.randomUUID(),
        type: 'bot',
        content: response.content,
        chartData: response.chartData,
      });
    });

    return () => cleanup();
  }, [addMessage, setThinking]);

  if (!isChatOpen) {
    return null;
  }

  const handleSend = () => {
    if (inputText.trim()) {
      sendMessage(inputText);
      setInputText('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 mx-4 max-w-2xl w-full h-[90vh] flex flex-col shadow-xl">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Ask The Analyst</h2>
             <button
                onClick={toggleChat}
                className="text-gray-500 hover:text-gray-800"
                >
                <span className="text-2xl">&times;</span>
            </button>
        </div>
        <div className="flex-1 overflow-y-auto border-t border-b mb-4 p-4">
          {messages.map((msg: ChatMessage) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
           {isThinking && (
            <div className="flex items-start gap-3 my-4">
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-gray-600 animate-pulse" />
              </div>
              <div className="p-3 rounded-2xl bg-gray-100 text-gray-800 rounded-bl-none">
                <p className="text-sm">...</p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="flex gap-2">
          <input 
            type="text" 
            placeholder="Ask about your work cycles..." 
            className="flex-1 p-2 border rounded-lg"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button 
            onClick={handleSend}
            className="bg-[#482F60] text-white py-2 px-4 rounded-lg hover:bg-[#3d2651] disabled:opacity-50"
            disabled={isThinking}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
} 