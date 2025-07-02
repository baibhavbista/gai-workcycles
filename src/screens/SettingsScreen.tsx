import React, { useState, useEffect } from 'react';
import { BackButton } from '../components/BackButton';
import { useWorkCyclesStore } from '../store/useWorkCyclesStore';
import { Settings as SettingsIcon, Eye, EyeOff } from 'lucide-react';
import { saveOpenAIKey, isEncryptionAvailable, getOpenAIKey } from '../electron-ipc';

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
  });
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [encAvailable, setEncAvailable] = useState(true);

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

  const handleSave = async () => {
    await updateSettings(local);
    if (local.aiEnabled && apiKey) {
      await saveOpenAIKey(apiKey.trim());
    } else if (!local.aiEnabled) {
      await saveOpenAIKey(''); // clear stored key
    }
    setApiKey('');
    goBack();
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
              onChange={(e) => setLocal({ ...local, aiEnabled: e.target.checked })}
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
                  className="w-full pr-10 p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#482F60] focus:border-[#482F60] transition-colors text-sm"
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
              <p className="text-xs text-gray-500 mt-1">
                {encAvailable ? 'Stored securely on your device.' : 'Stored locally in plain text.'}
              </p>
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
          <p className="text-xs text-gray-500 mt-1">Requires app restart on some platforms.</p>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          className="w-full py-3 bg-[#482F60] text-white rounded-xl hover:bg-[#3d2651] transition font-medium"
        >
          Save Settings
        </button>
      </div>
    </div>
  );
} 