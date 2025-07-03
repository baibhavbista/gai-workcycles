import React, { useEffect, useState, useMemo } from 'react';
import { Calendar, Clock, Target, TrendingUp, Search, Filter, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useWorkCyclesStore } from '../store/useWorkCyclesStore';
import { 
  isElectron, 
  listAllCycles, 
  embeddingCascadingSearch, 
  getSearchSuggestions 
} from '../electron-ipc';
import { BackButton } from '../components/BackButton';

interface CycleWithSession {
  id: string;
  sessionId: string;
  idx: number;
  goal: string;
  firstStep: string;
  hazards: string;
  energy: string;
  morale: string;
  status: 'hit' | 'miss' | 'partial';
  noteworthy: string;
  distractions: string;
  improvement: string;
  startedAt: Date;
  endedAt: Date;
  sessionObjective: string;
  sessionStartedAt: Date;
}

interface GroupedCycles {
  [sessionId: string]: {
    sessionObjective: string;
    sessionStartedAt: Date;
    cycles: CycleWithSession[];
  };
}

export function HistoryScreen() {
  const { setScreen } = useWorkCyclesStore();
  
  const [allCycles, setAllCycles] = useState<CycleWithSession[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CycleWithSession[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState<'basic' | 'semantic'>('semantic');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Load all cycles on mount
  useEffect(() => {
    if (isElectron()) {
      loadAllCycles();
    } else {
      setLoading(false);
    }
  }, []);

  const loadAllCycles = async () => {
    try {
      setLoading(true);
      const cycles = await listAllCycles();
      setAllCycles(cycles);
      // Expand the first few sessions by default
      const sessionIds = [...new Set(cycles.slice(0, 3).map(c => c.sessionId))];
      setExpandedSessions(new Set(sessionIds));
    } catch (error) {
      console.error('Failed to load cycles:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      if (searchMode === 'semantic' && isElectron()) {
        try {
          setIsSearching(true);
          const results = await embeddingCascadingSearch(searchQuery, searchQuery, 20);
          
          // Match results to cycles
          const matchedCycles = results
            .map(result => allCycles.find(cycle => 
              cycle.id === result.id || 
              cycle.sessionId === result.sessionId
            ))
            .filter(Boolean) as CycleWithSession[];
          
          setSearchResults(matchedCycles);
        } catch (error) {
          console.error('Search failed:', error);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      } else {
        // Basic text search
        const filtered = allCycles.filter(cycle =>
          cycle.goal.toLowerCase().includes(searchQuery.toLowerCase()) ||
          cycle.noteworthy.toLowerCase().includes(searchQuery.toLowerCase()) ||
          cycle.distractions.toLowerCase().includes(searchQuery.toLowerCase()) ||
          cycle.improvement.toLowerCase().includes(searchQuery.toLowerCase()) ||
          cycle.sessionObjective.toLowerCase().includes(searchQuery.toLowerCase())
        );
        setSearchResults(filtered);
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [searchQuery, searchMode, allCycles]);

  // Get search suggestions
  useEffect(() => {
    if (searchQuery.length > 2 && isElectron()) {
      const suggestionTimeout = setTimeout(async () => {
        try {
          const suggestions = await getSearchSuggestions(searchQuery);
          setSuggestions(suggestions);
        } catch (error) {
          console.error('Failed to get suggestions:', error);
        }
      }, 200);

      return () => clearTimeout(suggestionTimeout);
    } else {
      setSuggestions([]);
    }
  }, [searchQuery]);

  // Group cycles by session
  const groupedCycles: GroupedCycles = useMemo(() => {
    const cyclesToDisplay = searchQuery.trim() ? searchResults : allCycles;
    
    return cyclesToDisplay.reduce((acc, cycle) => {
      const sessionId = cycle.sessionId;
      if (!acc[sessionId]) {
        acc[sessionId] = {
          sessionObjective: cycle.sessionObjective,
          sessionStartedAt: cycle.sessionStartedAt,
          cycles: []
        };
      }
      acc[sessionId].cycles.push(cycle);
      return acc;
    }, {} as GroupedCycles);
  }, [allCycles, searchResults, searchQuery]);

  // Sort sessions by date (newest first)
  const sortedSessions = useMemo(() => {
    return Object.entries(groupedCycles)
      .sort(([, a], [, b]) => 
        new Date(b.sessionStartedAt).getTime() - new Date(a.sessionStartedAt).getTime()
      );
  }, [groupedCycles]);

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return 'Unknown';
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'Invalid Date';
    
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d);
  };
  
  const formatTime = (date: Date | string | null | undefined) => {
    if (!date) return '--:--';
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return '--:--';
    
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  };

  const toggleSessionExpansion = (sessionId: string) => {
    const newExpanded = new Set(expandedSessions);
    if (newExpanded.has(sessionId)) {
      newExpanded.delete(sessionId);
    } else {
      newExpanded.add(sessionId);
    }
    setExpandedSessions(newExpanded);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'hit': return 'text-green-600 bg-green-50';
      case 'miss': return 'text-red-600 bg-red-50';
      case 'partial': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <span key={index} className="bg-yellow-200 font-medium">{part}</span>
      ) : part
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-6">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-6">
            <BackButton />
            <h1 className="text-xl font-bold text-gray-900">History</h1>
            <div className="w-9" />
          </div>
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#482F60] mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading your cycles...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <BackButton />
          <h1 className="text-xl font-bold text-gray-900">History</h1>
          <div className="w-9" />
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search cycles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className="w-full pl-10 pr-24 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#482F60] focus:border-[#482F60] transition-colors"
            />
            
            {/* Search mode toggle */}
            <div className="absolute right-2 top-2 flex items-center gap-1">
              <button
                onClick={() => setSearchMode(searchMode === 'basic' ? 'semantic' : 'basic')}
                className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                  searchMode === 'semantic' 
                    ? 'bg-[#482F60] text-white' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {searchMode === 'semantic' ? 'AI' : 'Basic'}
              </button>
              
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Search suggestions */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setSearchQuery(suggestion);
                    setShowSuggestions(false);
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 first:rounded-t-xl last:rounded-b-xl"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search status */}
        {searchQuery && (
          <div className="mb-4 text-sm text-gray-600">
            {isSearching ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#482F60]"></div>
                Searching...
              </div>
            ) : (
              <span>
                Found {searchResults.length} cycle{searchResults.length !== 1 ? 's' : ''} 
                {searchMode === 'semantic' ? ' (AI-powered)' : ''}
              </span>
            )}
          </div>
        )}

        {/* Results */}
        {sortedSessions.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-2xl mb-4">
              <Calendar className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchQuery ? 'No results found' : 'No cycles yet'}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchQuery 
                ? 'Try adjusting your search terms or switch search modes'
                : 'Complete your first cycle to see your history here.'
              }
            </p>
            {!searchQuery && (
              <button
                onClick={() => setScreen('session-intentions')}
                className="px-6 py-3 bg-[#482F60] text-white rounded-xl font-medium hover:bg-[#3d2651] transition-colors duration-200"
              >
                Start First Session
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {sortedSessions.map(([sessionId, sessionData]) => (
              <div key={sessionId} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Session Header */}
                <button
                  onClick={() => toggleSessionExpansion(sessionId)}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">
                        {formatDate(sessionData.sessionStartedAt)} at {formatTime(sessionData.sessionStartedAt)}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-900">
                      {highlightText(sessionData.sessionObjective || 'Session objective', searchQuery)}
                    </h3>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span>{sessionData.cycles.length} cycles</span>
                      <span>
                        {sessionData.cycles.filter(c => c.status === 'hit').length} hits
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="text-lg font-bold text-[#482F60]">
                        {Math.round((sessionData.cycles.filter(c => c.status === 'hit').length / sessionData.cycles.length) * 100)}%
                      </div>
                      <div className="text-xs text-gray-500">success</div>
                    </div>
                    {expandedSessions.has(sessionId) ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Cycles */}
                {expandedSessions.has(sessionId) && (
                  <div className="border-t border-gray-100">
                    {sessionData.cycles.map((cycle) => (
                      <div key={cycle.id} className="p-4 border-b border-gray-50 last:border-b-0">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-gray-900">
                                Cycle {cycle.idx + 1}
                              </span>
                              <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(cycle.status)}`}>
                                {cycle.status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 mb-2">
                              {highlightText(cycle.goal, searchQuery)}
                            </p>
                          </div>
                          <div className="text-right text-xs text-gray-500">
                            {formatTime(cycle.startedAt)} - {formatTime(cycle.endedAt)}
                          </div>
                        </div>
                        
                        {cycle.noteworthy && (
                          <div className="text-sm text-gray-600 mb-1">
                            <strong>Noteworthy:</strong> {highlightText(cycle.noteworthy, searchQuery)}
                          </div>
                        )}
                        
                        {cycle.distractions && (
                          <div className="text-sm text-gray-600 mb-1">
                            <strong>Distractions:</strong> {highlightText(cycle.distractions, searchQuery)}
                          </div>
                        )}
                        
                        {cycle.improvement && (
                          <div className="text-sm text-gray-600">
                            <strong>Improvement:</strong> {highlightText(cycle.improvement, searchQuery)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}