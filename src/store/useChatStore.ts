import { create } from 'zustand';
import { isElectron, agentSendMessage } from '../electron-ipc';
import { ChatMessage } from '../types';

interface ChatState {
  isChatOpen: boolean;
  messages: ChatMessage[];
  isThinking: boolean;
  toggleChat: () => void;
  addMessage: (message: ChatMessage) => void;
  sendMessage: (text: string) => void;
  setThinking: (isThinking: boolean) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  isChatOpen: false,
  messages: [],
  isThinking: false,
  toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen })),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setThinking: (isThinking) => set({ isThinking }),
  sendMessage: (text) => {
    const { addMessage, setThinking } = get();
    
    addMessage({
      id: crypto.randomUUID(),
      type: 'user',
      content: text,
    });

    setThinking(true);

    // Send messages to the backend using the new wrapper
    agentSendMessage(get().messages);

    // Mock response for browser-based development
    if (!isElectron()) {
      setTimeout(() => {
        get().addMessage({
          id: crypto.randomUUID(),
          type: 'bot',
          content: 'This is a mock response because we are not in Electron.',
        });
        get().setThinking(false);
      }, 1000);
    }
  },
}));
