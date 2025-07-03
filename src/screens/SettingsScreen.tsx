import React, { useState, useEffect } from 'react';
import { BackButton } from '../components/BackButton';
import { useWorkCyclesStore } from '../store/useWorkCyclesStore';
import { Settings as SettingsIcon, Eye, EyeOff, Activity, Database, Clock, RefreshCw, AlertCircle, CheckCircle, Zap } from 'lucide-react';
import { 
  saveOpenAIKey, 
  isEncryptionAvailable, 
  getOpenAIKey, 
  getEmbeddingQueueStatus,
  getEmbeddingDbStats,
  triggerEmbeddingBackfill,
  clearEmbeddingCache
} from '../electron-ipc';

type SaveState = 'idle' | 'saving' | 'saved';

interface EmbeddingStatus {
  pending: number;
  processing: number;
  total: number;
  statistics: {
    pending: number;
    processing: number;
    done: number;
    error: number;
  };
}

interface DbStats {
  totalEmbeddings: number;
  fieldEmbeddings: number;
  cycleEmbeddings: number;
  sessionEmbeddings: number;
  lastUpdate: string | null;
  storageSize: number;
  queueStatistics: {
    pending: number;
    processing: number;
    done: number;
    error: number;
  };
}

export function SettingsScreen() {
  const { settings, updateSettings, goBack } = useWorkCyclesStore();
  const [local, setLocal] = useState(() => settings ?? {
    aiEnabled: false,
    workMinutes: 30,
    breakMinutes: 5,
    cyclesPlanned: 6,
    chimeEnabled: true,
    notifyEnabled: true,
    hotkey: 'Control+Shift+U',
    trayTimerEnabled: true,
  });
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [encAvailable, setEncAvailable] = useState(true);
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  
  // Embedding status states
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingStatus | null>(null);
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [lastStatusUpdate, setLastStatusUpdate] = useState<Date | null>(null);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [cacheLoading, setCacheLoading] = useState(false);

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  useEffect(() => {
    isEncryptionAvailable()
      .then(setEncAvailable)
      .catch(() => setEncAvailable(false));

    // fetch stored key, if any
    getOpenAIKey()
      .then((k) => {
        if (k) {
          setApiKey(k);
          setLocal((prev) => ({ ...prev, aiEnabled: true }));
        }
      })
      .catch(() => {});
  }, []);

  // Load embedding status when AI is enabled
  useEffect(() => {
    if (local.aiEnabled) {
      loadEmbeddingStatus();
      // Set up 30-second refresh interval
      const interval = setInterval(loadEmbeddingStatus, 30000);
      return () => clearInterval(interval);
    } else {
      setEmbeddingStatus(null);
      setDbStats(null);
    }
  }, [local.aiEnabled]);

  const loadEmbeddingStatus = async () => {
    try {
      setStatusLoading(true);
      setStatusError(null);
      
      const [queueStatus, dbStatsData] = await Promise.all([
        getEmbeddingQueueStatus(),
        getEmbeddingDbStats()
      ]);
      
      setEmbeddingStatus(queueStatus);
      setDbStats(dbStatsData);
      setLastStatusUpdate(new Date());
    } catch (error) {
      console.error('Failed to load embedding status:', error);
      setStatusError('Failed to load embedding status');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleBackfill = async () => {
    try {
      setBackfillLoading(true);
      await triggerEmbeddingBackfill(50);
      // Refresh status after backfill
      setTimeout(loadEmbeddingStatus, 2000);
    } catch (error) {
      console.error('Backfill failed:', error);
    } finally {
      setBackfillLoading(false);
    }
  };

  const handleClearCache = async () => {
    try {
      setCacheLoading(true);
      await clearEmbeddingCache();
      // Refresh status after cache clear
      setTimeout(loadEmbeddingStatus, 1000);
    } catch (error) {
      console.error('Cache clear failed:', error);
    } finally {
      setCacheLoading(false);
    }
  };

  // Clear API key error when key changes
  useEffect(() => {
    setApiKeyError(null);
  }, [apiKey]);

  const isValidAccelerator = (acc: string) => {
    if (!acc) return false;
    // Must have at least one '+' (modifier + key)
    if (!acc.includes('+')) return false;
    const parts = acc.split('+');
    const key = parts.pop()?.trim();
    if (!key) return false;
    const modifierPattern = /^(Ctrl|Control|Cmd|Command|Alt|Option|Shift|Super|Meta)$/i;
    if (!parts.every(p => modifierPattern.test(p.trim()))) return false;

    // Key cannot contain '-' or '+' and must be single char alnum OR Fx key
    if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(key)) return true;
    return /^[A-Za-z0-9]$/.test(key);
  };

  const isValidOpenAIKey = (key: string) => {
    return key.trim().startsWith('sk-') && key.trim().length > 3;
  };

  const handleSave = async () => {
    // Reset errors
    setHotkeyError(null);
    setApiKeyError(null);

    // validate hotkey
    if (!isValidAccelerator(local.hotkey)) {
      setHotkeyError('Invalid hotkey format');
      return;
    }

    // Validate OpenAI key if AI is enabled
    if (local.aiEnabled) {
      if (!apiKey) {
        setApiKeyError('OpenAI API key is required when AI features are enabled');
        return;
      }
      if (!isValidOpenAIKey(apiKey)) {
        setApiKeyError('Invalid OpenAI API key format. Must start with "sk-"');
        return;
      }
    }

    setSaveState('saving');
    
    try {
      await updateSettings(local);
      if (local.aiEnabled && apiKey) {
        await saveOpenAIKey(apiKey.trim());
      } else if (!local.aiEnabled) {
        await saveOpenAIKey(''); // clear stored key
      }
      setApiKey('');
      setSaveState('saved');
      
      // Navigate back after showing "Saved"
      setTimeout(() => {
        goBack();
      }, 1000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveState('idle');
    }
  };

  const getSaveButtonText = () => {
    switch (saveState) {
      case 'saving':
        return 'Saving...';
      case 'saved':
        return 'Saved ✓';
      default:
        return 'Save Settings';
    }
  };

  const getStatusColor = (status: 'good' | 'warning' | 'error') => {
    switch (status) {
      case 'good': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getQueueStatus = (): { status: 'good' | 'warning' | 'error', text: string } => {
    if (!embeddingStatus) return { status: 'error', text: 'Unknown' };
    
    const { pending, processing, statistics } = embeddingStatus;
    
    if (statistics.error > 0 && pending === 0 && processing === 0) {
      return { status: 'error', text: `${statistics.error} errors` };
    }
    
    if (processing > 0) {
      return { status: 'warning', text: `Processing ${processing} jobs` };
    }
    
    if (pending > 0) {
      return { status: 'warning', text: `${pending} jobs pending` };
    }
    
    return { status: 'good', text: 'Queue empty' };
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <BackButton />
          <SettingsIcon className="w-5 h-5 text-[#482F60]" />
          <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        </div>

        {/* AI Features */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm mb-4">
          <h3 className="font-semibold text-gray-900 mb-2">AI Features</h3>
          <label className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              checked={local.aiEnabled}
              onChange={(e) => {
                setLocal({ ...local, aiEnabled: e.target.checked });
                if (!e.target.checked) {
                  setApiKeyError(null);
                }
              }}
              className="w-5 h-5 text-[#482F60] border-gray-300 rounded focus:ring-[#482F60]"
            />
            <span className="text-sm text-gray-700">Enable AI features</span>
          </label>
          {local.aiEnabled && (
            <div className="mt-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">OpenAI API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className={`w-full pr-10 p-3 border rounded-lg focus:ring-2 focus:ring-[#482F60] transition-colors text-sm ${
                    apiKeyError ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-[#482F60]'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-700"
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {apiKeyError ? (
                <p className="text-xs text-red-600 mt-1">{apiKeyError}</p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  {encAvailable ? 'Stored securely on your device.' : 'Stored locally in plain text (electron safeStorage API not available on your device)'}
                </p>
              )}
            </div>
          )}

          {/* Embedding Status Section */}
          {local.aiEnabled && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900">Embedding System Status</h4>
                <button
                  onClick={loadEmbeddingStatus}
                  disabled={statusLoading}
                  className="p-1 text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${statusLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {statusError ? (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <span className="text-sm text-red-700">{statusError}</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Queue Status */}
                  {embeddingStatus && (
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">Queue Status</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${getStatusColor(getQueueStatus().status)}`}>
                          {getQueueStatus().text}
                        </span>
                        {getQueueStatus().status === 'good' && (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Database Stats */}
                  {dbStats && (
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">Embeddings</span>
                      </div>
                      <span className="text-sm text-gray-600">
                        {dbStats.totalEmbeddings} stored
                      </span>
                    </div>
                  )}

                  {/* Last Update */}
                  {lastStatusUpdate && (
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">Last Update</span>
                      </div>
                      <span className="text-sm text-gray-600">
                        {lastStatusUpdate.toLocaleTimeString()}
                      </span>
                    </div>
                  )}

                  {/* Manual Controls */}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={handleBackfill}
                      disabled={backfillLoading}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#482F60] text-white rounded-lg hover:bg-[#3d2651] transition-colors disabled:opacity-50 text-sm"
                    >
                      {backfillLoading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Zap className="w-4 h-4" />
                      )}
                      {backfillLoading ? 'Processing...' : 'Backfill'}
                    </button>
                    <button
                      onClick={handleClearCache}
                      disabled={cacheLoading}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 text-sm"
                    >
                      {cacheLoading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      {cacheLoading ? 'Clearing...' : 'Clear Cache'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Default Session Parameters */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm mb-4">
          <h3 className="font-semibold text-gray-900 mb-3">Default Session Parameters</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Work minutes</label>
              <input
                type="number"
                min={1}
                max={60}
                value={local.workMinutes}
                onChange={(e) => setLocal({ ...local, workMinutes: parseInt(e.target.value) || 30 })}
                className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#482F60] focus:border-[#482F60] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Break minutes</label>
              <input
                type="number"
                min={1}
                max={30}
                value={local.breakMinutes}
                onChange={(e) => setLocal({ ...local, breakMinutes: parseInt(e.target.value) || 5 })}
                className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#482F60] focus:border-[#482F60] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Cycles total</label>
              <input
                type="number"
                min={1}
                max={12}
                value={local.cyclesPlanned}
                onChange={(e) => setLocal({ ...local, cyclesPlanned: parseInt(e.target.value) || 6 })}
                className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#482F60] focus:border-[#482F60] transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Notifications & Chime */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm mb-4">
          <h3 className="font-semibold text-gray-900 mb-2">Notifications & Chime</h3>
          <label className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              checked={local.chimeEnabled}
              onChange={(e) => setLocal({ ...local, chimeEnabled: e.target.checked })}
              className="w-5 h-5 text-[#482F60] border-gray-300 rounded focus:ring-[#482F60]"
            />
            <span className="text-sm text-gray-700">Play chime when cycle ends</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={local.notifyEnabled}
              onChange={(e) => setLocal({ ...local, notifyEnabled: e.target.checked })}
              className="w-5 h-5 text-[#482F60] border-gray-300 rounded focus:ring-[#482F60]"
            />
            <span className="text-sm text-gray-700">Show desktop notification</span>
          </label>
        </div>

        {/* Tray Timer */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm mb-6">
          <h3 className="font-semibold text-gray-900 mb-2">Menu-bar Countdown</h3>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={local.trayTimerEnabled}
              onChange={(e) => setLocal({ ...local, trayTimerEnabled: e.target.checked })}
              className="w-5 h-5 text-[#482F60] border-gray-300 rounded focus:ring-[#482F60]"
            />
            <span className="text-sm text-gray-700">Show countdown in system tray / menu-bar</span>
          </label>
        </div>

        {/* Hotkey */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm mb-6">
          <h3 className="font-semibold text-gray-900 mb-2">Global Hotkey</h3>
          <input
            type="text"
            value={local.hotkey}
            onChange={(e) => setLocal({ ...local, hotkey: e.target.value })}
            className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#482F60] focus:border-[#482F60] transition-colors text-sm"
            placeholder="Control+Shift+U"
          />
          {hotkeyError ? (
            <p className="text-xs text-red-600 mt-1">{hotkeyError}</p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">
              Current registered: {settings?.hotkey}. Requires app restart on some platforms.
            </p>
          )}
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saveState !== 'idle'}
          className={`w-full py-3 bg-[#482F60] text-white rounded-xl transition font-medium
            ${saveState === 'idle' ? 'hover:bg-[#3d2651]' : ''}
            ${saveState === 'saved' ? 'bg-green-600' : ''}
            ${saveState === 'saving' ? 'opacity-80 cursor-wait' : ''}`}
        >
          {getSaveButtonText()}
        </button>
      </div>
    </div>
  );
} 