import React from 'react';
import { useWorkCyclesStore } from './store/useWorkCyclesStore';
import { HomeScreen } from './screens/HomeScreen';
import { SessionIntentionsScreen } from './screens/SessionIntentionsScreen';
import { PreCycleScreen } from './screens/PreCycleScreen';
import { TimerScreen } from './screens/TimerScreen';
import { CycleReflectionScreen } from './screens/CycleReflectionScreen';
import { BreakScreen } from './screens/BreakScreen';
import { BreakCompleteScreen } from './screens/BreakCompleteScreen';
import { SessionReviewScreen } from './screens/SessionReviewScreen';
import { SessionOverviewScreen } from './screens/SessionOverviewScreen';
import { SessionSpreadsheetScreen } from './screens/SessionSpreadsheetScreen';
import { HistoryScreen } from './screens/HistoryScreen';

function App() {
  const { currentScreen } = useWorkCyclesStore();
  
  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return <HomeScreen />;
      case 'session-intentions':
        return <SessionIntentionsScreen />;
      case 'pre-cycle':
        return <PreCycleScreen />;
      case 'timer':
        return <TimerScreen />;
      case 'cycle-reflection':
        return <CycleReflectionScreen />;
      case 'break':
        return <BreakScreen />;
      case 'break-complete':
        return <BreakCompleteScreen />;
      case 'session-review':
        return <SessionReviewScreen />;
      case 'session-overview':
        return <SessionOverviewScreen />;
      case 'session-spreadsheet':
        return <SessionSpreadsheetScreen />;
      case 'history':
        return <HistoryScreen />;
      default:
        return <HomeScreen />;
    }
  };
  
  return (
    <div className="w-full h-screen overflow-hidden">
      {renderScreen()}
    </div>
  );
}

export default App;