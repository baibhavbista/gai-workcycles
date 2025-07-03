import React from 'react';
import { Copy, Home, Clock, Target, Zap, TrendingUp, Table } from 'lucide-react';
import { useWorkCyclesStore } from '../store/useWorkCyclesStore';

export function SessionOverviewScreen() {
  const { currentSession, setScreen } = useWorkCyclesStore();
  
  if (!currentSession) return null;
  
  const completedCycles = currentSession.cycles.length;
  const totalTime = completedCycles * currentSession.intentions.workMinutes;
  const hitTargets = currentSession.cycles.filter(c => c.status === 'hit').length;
  const successRate = completedCycles > 0 ? Math.round((hitTargets / completedCycles) * 100) : 0;
  
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };
  
  const handleCopyMarkdown = () => {
    // Generate markdown content
    const markdown = `# Session Overview - ${formatDate(currentSession.startedAt)}

## Session Stats
- **Cycles:** ${completedCycles}
- **Total Time:** ${totalTime}m
- **Targets Hit:** ${hitTargets}/${completedCycles}
- **Success Rate:** ${successRate}%

## Session Intentions

### What am I trying to accomplish?
${currentSession.intentions.objective}

### Why is this important and valuable?
${currentSession.intentions.importance}

### How will I know this is complete?
${currentSession.intentions.definitionOfDone}

### Any risks / hazards?
${currentSession.intentions.hazards}

### Anything else noteworthy?
${currentSession.intentions.miscNotes}

**Concrete/Measurable:** ${currentSession.intentions.concrete ? 'Yes' : 'No'}

## Work Cycles

${currentSession.cycles.map((cycle, idx) => `
### Cycle ${idx + 1}
- **Duration:** ${currentSession.intentions.workMinutes}m
- **Energy:** ${cycle.energy}
- **Morale:** ${cycle.morale}
- **Target:** ${cycle.status === 'hit' ? 'Hit' : cycle.status === 'partial' ? 'Partial' : 'Missed'}

**Goal:** ${cycle.goal}

**Getting started:** ${cycle.firstStep}

**Hazards:** ${cycle.hazards}
`).join('')}
`;
    
    navigator.clipboard.writeText(markdown);
  };
  
  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Session Overview</h1>
            <p className="text-gray-600 text-sm">
              {formatDate(currentSession.startedAt)} • {completedCycles} cycles • {totalTime}m
            </p>
          </div>
          <div className="flex gap-2">
            {/* <button
              onClick={() => setScreen('session-spreadsheet')}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
            >
              <Table className="w-4 h-4" />
              Spreadsheet
            </button> */}
            <button
              onClick={handleCopyMarkdown}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Copy className="w-4 h-4" />
              Copy as Markdown
            </button>
            <button
              onClick={() => setScreen('home')}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-[#6366f1] text-white rounded-lg hover:bg-[#5855eb] transition-colors"
            >
              <Home className="w-4 h-4" />
              Home
            </button>
          </div>
        </div>
        
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-[#6366f1] mb-1">{completedCycles}</div>
            <div className="text-sm text-gray-600">Cycles</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-[#6366f1] mb-1">{totalTime}m</div>
            <div className="text-sm text-gray-600">Total Time</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-[#6366f1] mb-1">{hitTargets}/{completedCycles}</div>
            <div className="text-sm text-gray-600">Targets Hit</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-green-600 mb-1">{successRate}%</div>
            <div className="text-sm text-gray-600">Success Rate</div>
          </div>
        </div>
        
        {/* Session Intentions */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-[#6366f1]" />
            <h3 className="font-semibold text-gray-900">Session Intentions</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-gray-900 mb-1">What am I trying to accomplish?</h4>
              <p className="text-gray-700 text-sm">{currentSession.intentions.objective}</p>
            </div>
            
            {currentSession.intentions.importance && (
              <div>
                <h4 className="font-medium text-gray-900 mb-1">Why is this important and valuable?</h4>
                <p className="text-gray-700 text-sm">{currentSession.intentions.importance}</p>
              </div>
            )}
            
            {currentSession.intentions.definitionOfDone && (
              <div>
                <h4 className="font-medium text-gray-900 mb-1">How will I know this is complete?</h4>
                <p className="text-gray-700 text-sm">{currentSession.intentions.definitionOfDone}</p>
              </div>
            )}
            
            {currentSession.intentions.hazards && (
              <div>
                <h4 className="font-medium text-gray-900 mb-1">Any risks / hazards?</h4>
                <p className="text-gray-700 text-sm">{currentSession.intentions.hazards}</p>
              </div>
            )}
            
            {currentSession.intentions.miscNotes && (
              <div>
                <h4 className="font-medium text-gray-900 mb-1">Anything else noteworthy?</h4>
                <p className="text-gray-700 text-sm">{currentSession.intentions.miscNotes}</p>
              </div>
            )}
            
            {currentSession.intentions.concrete && (
              <div className="inline-flex items-center px-3 py-1 bg-[#6366f1] text-white text-sm rounded-full">
                Concrete/Measurable
              </div>
            )}
          </div>
        </div>
        
        {/* Work Cycles */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="font-semibold text-gray-900 mb-2">Work Cycles</h3>
          <p className="text-gray-600 text-sm mb-4">Detailed breakdown of each cycle</p>
          
          <div className="space-y-6">
            {currentSession.cycles.map((cycle, idx) => (
              <div key={cycle.id} className="border-b border-gray-100 last:border-b-0 pb-6 last:pb-0">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900">Cycle {idx + 1}</h4>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {currentSession.intentions.workMinutes}m
                    </div>
                    <div className="flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      {cycle.energy}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-red-500">❤️</span>
                      {cycle.morale}
                    </div>
                    <div className={`px-2 py-1 rounded text-xs ${
                      cycle.status === 'hit' ? 'bg-green-100 text-green-700' :
                      cycle.status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      Target {cycle.status === 'hit' ? 'Hit' : cycle.status === 'partial' ? 'Partial' : 'Missed'}
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium text-gray-900">Goal:</span>
                    <span className="text-gray-700 ml-1">{cycle.goal}</span>
                  </div>
                  {cycle.firstStep && (
                    <div>
                      <span className="font-medium text-gray-900">Getting started:</span>
                      <span className="text-gray-700 ml-1">{cycle.firstStep}</span>
                    </div>
                  )}
                  {cycle.hazards && (
                    <div>
                      <span className="font-medium text-gray-900">Hazards:</span>
                      <span className="text-gray-700 ml-1">{cycle.hazards}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}