# WorkCycles Productivity App

WorkCycles is an offline-first **Electron 27** desktop application (macOS & Windows) built with React 18 + TypeScript. It helps you run UltraWorking-style work cycles while staying entirely local—sessions, voice notes, and cycle data are stored in SQLite on your device.

## 🎯 Overview

WorkCycles is a React-based productivity application that helps users maintain focus through structured work sessions. The app implements the methodology originally developed by UltraWorking.com, featuring:

- **Structured Sessions**: Set clear intentions before starting work
- **Focused Cycles**: 30-minute work periods with defined goals
- **Reflective Breaks**: 5-10 minute breaks between cycles for processing
- **Session Review**: Comprehensive analysis of productivity patterns
- **Data Export**: Spreadsheet view with CSV export capabilities

## 🚀 Features

### Core Functionality
- **Session Planning**: Set objectives, importance, definition of done, and potential hazards
- **Cycle Management**: Plan individual cycles with specific goals, energy/morale tracking
- **Timer System**: Visual countdown timer with pause/resume functionality
- **Real-time Logging**: Voice notes and manual entries for work progress and distractions
- **Reflection Tools**: Post-cycle and post-session review forms
- **History Tracking**: Complete session history with success metrics

### Desktop-Specific Features
- **System Tray Timer**: Optional live MM:SS countdown in the macOS menu-bar (Windows/Linux tray TBD)
- **Global Hotkey**: Show/hide window with user-configurable accelerator (default Ctrl+Shift+U)
- **Settings Panel**: Toggle AI features, default cycle lengths, chime/notification, tray timer, and hotkey

### AI-Powered Features
- **Voice Recording**: Real microphone capture with OpenAI Whisper transcription
- **Smart Form Filling**: Voice-to-text with AI form field auto-population
- **Distraction Analysis**: Automatic analysis of distraction notes with structured insights
- **Visual Feedback**: Green glow animation and sparkle icons for AI-filled fields
- **Intelligent Transcription**: Context-aware form filling based on spoken content

### Advanced Features
- **Spreadsheet View**: Interactive table showing all cycle data in a familiar format
- **CSV Export**: Download session data for external analysis
- **Persistent Note Storage**: SQLite database with comprehensive cycle notes tracking
- **Session Note History**: View notes from current cycle and entire session chronologically
- **Responsive Design**: Mobile-first design that works across all devices
- **Data Persistence**: SQLite with WAL mode for reliable data storage

## 🛠 Technology Stack

- **Frontend**: React 18 with TypeScript
- **State Management**: Zustand with persistence
- **Styling**: Tailwind CSS with custom animations
- **Icons**: Lucide React
- **Data Tables**: TanStack React Table
- **Build Tool**: Vite
- **Desktop Framework**: Electron 27
- **Database**: SQLite with better-sqlite3
- **AI Integration**: OpenAI Whisper API (transcription), GPT-4o-mini (form filling & analysis)
- **Development**: ESLint, TypeScript strict mode

## 📱 Application Flow

### 1. Home Screen
- Welcome interface with feature overview
- Quick access to start new session or view history
- Today's session summary with success rates
- Settings access and help information

### 2. Session Intentions
- Set session objective and importance
- Define completion criteria
- Identify potential hazards and distractions
- Configure cycle settings (duration, breaks, number of cycles)
- Voice recording with AI form filling

### 3. Pre-Cycle Planning
- Set specific goal for the upcoming cycle
- Plan first steps and identify hazards
- Assess current energy and morale levels
- AI-powered voice input for all fields

### 4. Timer Screen
- Visual circular timer with progress indicator
- Pause/resume and early finish controls
- Real-time work and distraction logging with voice recording
- Manual note entry with editing capabilities
- Session notes view showing all cycle notes chronologically
- Persistent note storage in SQLite database

### 5. Cycle Reflection
- Evaluate goal completion (hit/partial/miss)
- Record noteworthy observations
- Document distractions with AI analysis
- Identify improvements for next cycle
- Choose to take break or finish session

### 6. Break Screen
- Countdown timer for break period
- Suggestions for effective break activities
- Option to skip break or pause

### 7. Session Review
- Comprehensive reflection on entire session
- Compare output to normal productivity
- Identify successes and areas for improvement
- Extract key takeaways and lessons

### 8. Session Overview
- Statistical summary of session performance
- Detailed breakdown of all cycles
- Markdown export functionality
- Access to spreadsheet view

### 9. Spreadsheet View
- Interactive table with all cycle data
- Editable cells with keyboard navigation
- Dropdown selectors for categorical data
- CSV export for external analysis

### 10. History
- List of all completed sessions
- Success rate and basic metrics
- Quick access to spreadsheet view for past sessions

### 11. Settings
- AI features toggle with OpenAI API key management
- Default session parameters (work/break duration, cycles)
- Desktop preferences (hotkey, tray timer, notifications)
- Secure API key storage with encryption

## 🎨 Design Philosophy

The application follows Apple-level design aesthetics with:

- **Clean Typography**: Consistent font hierarchy with proper spacing
- **Thoughtful Colors**: Purple-based primary palette with semantic color coding
- **Micro-interactions**: Subtle animations, hover states, and AI feedback
- **Visual Hierarchy**: Clear information architecture and progressive disclosure
- **Accessibility**: High contrast ratios and keyboard navigation support
- **AI Integration**: Non-intrusive AI assistance with visual feedback

## 📊 Data Structure

### Session
```typescript
interface Session {
  id: string;
  startedAt: Date;
  intentions: SessionIntentions;
  cycles: CycleData[];
  completed: boolean;
  currentCycleIdx: number;
}
```

### Cycle Data
```typescript
interface CycleData {
  id: string;
  sessionId: string;
  idx: number;
  goal: string;
  firstStep: string;
  hazards: string;
  energy: 'High' | 'Medium' | 'Low';
  morale: 'High' | 'Medium' | 'Low';
  status?: 'hit' | 'miss' | 'partial';
  noteworthy: string;
  distractions: string;
  improvement: string;
  startedAt?: Date;
  endedAt?: Date;
}
```

### Cycle Notes
```typescript
interface CycleNote {
  id: string;
  sessionId: string;
  cycleId: string;
  cycleIdx: number;
  noteType: 'work' | 'distraction';
  entryType: 'voice' | 'manual';
  text: string;
  timestamp: Date;
  createdAt: Date;
}
```

## 🗄️ Database Schema

The application uses SQLite with the following key tables:

- **sessions**: Core session data with intentions and completion status
- **cycles**: Individual cycle planning and reflection data
- **cycle_notes**: Real-time work and distraction notes during cycles
- **app_settings**: User preferences and encrypted API keys
- **window_bounds**: Electron window positioning

## 🔧 Development Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run linting
npm run lint
```

## 📁 Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Timer.tsx       # Circular progress timer
│   ├── VoiceRecorder.tsx # Voice recording with AI integration
│   ├── LabelledTextArea.tsx # Auto-resize textarea with AI feedback
│   └── AutoResizeTextarea.tsx # Self-expanding textarea
├── screens/            # Full-screen application views
│   ├── HomeScreen.tsx
│   ├── SessionIntentionsScreen.tsx
│   ├── PreCycleScreen.tsx
│   ├── TimerScreen.tsx
│   ├── CycleReflectionScreen.tsx
│   ├── BreakScreen.tsx
│   ├── BreakCompleteScreen.tsx
│   ├── SessionReviewScreen.tsx
│   ├── SessionOverviewScreen.tsx
│   ├── SessionSpreadsheetScreen.tsx
│   ├── HistoryScreen.tsx
│   └── SettingsScreen.tsx
├── store/              # State management
│   └── useWorkCyclesStore.ts
├── types/              # TypeScript definitions
│   └── index.ts
├── client-side-ai.ts   # AI integration utilities
├── electron-ipc.ts     # Electron IPC helpers
└── App.tsx            # Main application component
```

## 🎯 Current Status

### ✅ Completed Features
- Complete session flow from planning to review
- Interactive timer with pause/resume functionality
- Real-time work and distraction logging with voice recording
- Comprehensive reflection and review system
- Session history with success metrics
- Spreadsheet view with editable cells
- CSV export functionality
- Responsive design for all screen sizes
- SQLite database persistence with comprehensive schema
- AI-powered voice transcription and form filling
- Automatic distraction analysis with GPT-4o-mini
- Visual feedback for AI-filled fields
- Secure API key storage with encryption
- Desktop integration (tray timer, global hotkey, notifications)

### 🚧 Areas for Enhancement
- Vector search with LanceDB for semantic note searching
- Advanced analytics and insights dashboard
- Team collaboration features
- Customizable themes and UI preferences
- Integration with calendar apps
- Mobile app versions
- Cloud synchronization options

## 🤖 AI Features

WorkCycles includes sophisticated AI integration:

- **Voice Transcription**: Uses OpenAI Whisper for accurate speech-to-text
- **Smart Form Filling**: GPT-4o-mini analyzes transcripts and fills appropriate form fields
- **Distraction Analysis**: Automatically processes distraction notes to provide structured insights
- **Visual Feedback**: Green glow animations and sparkle icons indicate AI-filled content
- **Graceful Degradation**: All AI features have manual fallbacks

## 📈 Methodology Background

The WorkCycles methodology is based on research-proven productivity techniques:

- **30-minute cycles**: Optimal duration for sustained focus
- **Structured reflection**: Continuous improvement through self-awareness
- **Energy/morale tracking**: Understanding personal productivity patterns
- **Intentional planning**: Clear objectives reduce decision fatigue
- **Break optimization**: Strategic rest for sustained performance

## 🤝 Contributing

This project follows modern React and Electron development practices:

- TypeScript for type safety
- Component-based architecture
- Functional programming patterns
- Responsive design principles
- Accessibility best practices
- Secure API key management

## 📄 License

This project is a productivity tool implementation inspired by the WorkCycles methodology. The original methodology was developed by UltraWorking.com.