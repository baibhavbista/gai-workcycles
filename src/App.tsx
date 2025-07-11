import React, { useEffect } from 'react';
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
import { SettingsScreen } from './screens/SettingsScreen';

function App() {
  const { currentScreen, loadSettings } = useWorkCyclesStore();
  
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);
  
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
      case 'settings':
        return <SettingsScreen />;
      default:
        return <HomeScreen />;
    }
  };
  
  return (
    <div className="w-full h-screen overflow-y-auto">
      {renderScreen()}
    </div>
  );
}

export default App;