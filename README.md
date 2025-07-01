# WorkCycles Productivity App

A modern web application implementing the WorkCycles methodology for structured productivity sessions with focused work cycles, intentional planning, and reflective review.

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

### Advanced Features
- **Spreadsheet View**: Interactive table showing all cycle data in a familiar format
- **CSV Export**: Download session data for external analysis
- **Voice Recording**: Simulated voice-to-text for quick note-taking
- **Responsive Design**: Mobile-first design that works across all devices
- **Data Persistence**: Local storage with automatic session saving

## 🛠 Technology Stack

- **Frontend**: React 18 with TypeScript
- **State Management**: Zustand with persistence
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Data Tables**: TanStack React Table
- **Build Tool**: Vite
- **Development**: ESLint, TypeScript strict mode

## 📱 Application Flow

### 1. Home Screen
- Welcome interface with feature overview
- Quick access to start new session or view history
- Information about the WorkCycles methodology

### 2. Session Intentions
- Set session objective and importance
- Define completion criteria
- Identify potential hazards and distractions
- Configure cycle settings (duration, breaks, number of cycles)

### 3. Pre-Cycle Planning
- Set specific goal for the upcoming cycle
- Plan first steps and identify hazards
- Assess current energy and morale levels

### 4. Timer Screen
- Visual circular timer with progress indicator
- Pause/resume and early finish controls
- Real-time work and distraction logging
- Voice note recording (simulated)
- Manual note entry with editing capabilities

### 5. Cycle Reflection
- Evaluate goal completion (hit/partial/miss)
- Record noteworthy observations
- Document distractions and improvements
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

## 🎨 Design Philosophy

The application follows Apple-level design aesthetics with:

- **Clean Typography**: Consistent font hierarchy with proper spacing
- **Thoughtful Colors**: Purple-based primary palette with semantic color coding
- **Micro-interactions**: Subtle animations and hover states
- **Visual Hierarchy**: Clear information architecture and progressive disclosure
- **Accessibility**: High contrast ratios and keyboard navigation support

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
│   └── VoiceRecorder.tsx # Voice recording interface
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
│   └── HistoryScreen.tsx
├── store/              # State management
│   └── useWorkCyclesStore.ts
├── types/              # TypeScript definitions
│   └── index.ts
└── App.tsx            # Main application component
```

## 🎯 Current Status

### ✅ Completed Features
- Complete session flow from planning to review
- Interactive timer with pause/resume functionality
- Real-time work and distraction logging
- Comprehensive reflection and review system
- Session history with success metrics
- Spreadsheet view with editable cells
- CSV export functionality
- Responsive design for all screen sizes
- Data persistence with local storage
- Voice recording simulation

### 🚧 Areas for Enhancement
- Real voice-to-text integration
- Cloud synchronization
- Advanced analytics and insights
- Team collaboration features
- Customizable themes
- Notification system
- Integration with calendar apps
- Mobile app versions

## 📈 Methodology Background

The WorkCycles methodology is based on research-proven productivity techniques:

- **30-minute cycles**: Optimal duration for sustained focus
- **Structured reflection**: Continuous improvement through self-awareness
- **Energy/morale tracking**: Understanding personal productivity patterns
- **Intentional planning**: Clear objectives reduce decision fatigue
- **Break optimization**: Strategic rest for sustained performance

## 🤝 Contributing

This project follows modern React development practices:

- TypeScript for type safety
- Component-based architecture
- Functional programming patterns
- Responsive design principles
- Accessibility best practices

## 📄 License

This project is a productivity tool implementation inspired by the WorkCycles methodology. The original methodology was developed by UltraWorking.com.