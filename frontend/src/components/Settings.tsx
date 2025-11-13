import { useState, useEffect } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import styles from './Settings.module.css';
import type { SettingsProps } from '../types';

export const Settings = ({ isOpen, onClose }: SettingsProps) => {
  const [settings, setSettings] = useState({
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (!window.electronAPI) return;
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    if (!window.electronAPI) return;
    
    try {
      const currentSettings = await window.electronAPI.getSettings();
      setSettings(currentSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleSave = async () => {
    if (!window.electronAPI) {
      setSaveStatus('error');
      console.error('Electron API not available');
      return;
    }

    setIsSaving(true);
    setSaveStatus('idle');
    
    try {
      const success = await window.electronAPI.saveSettings(settings);
      setSaveStatus(success ? 'success' : 'error');
      
      if (success) {
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (error) {
      setSaveStatus('error');
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!window.electronAPI) {
      setTestResult({ success: false, message: 'Electron API not available' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    
    try {
      const result = await window.electronAPI.testApiConnection(settings);
      setTestResult(result);
    } catch (error) {
      setTestResult({ success: false, message: 'Connection failed' });
      console.error('API test failed:', error);
    } finally {
      setIsTesting(false);
    }
  };

  if (!isOpen) return null;
  
  return (
    <div className={styles.settingsPanel}>
      <div className={styles.header}>
        <h2 className={styles.title}>
          API Settings
        </h2>
        <button
          onClick={onClose}
          className={styles.closeButton}
          aria-label="Close settings"
        >
          <X className={styles.icon} />
        </button>
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="apiKey" className={styles.label}>
          API Key
        </label>
        <input
          id="apiKey"
          type="password"
          value={settings.apiKey}
          onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
          className={styles.input}
          placeholder="Enter your API key"
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="baseUrl" className={styles.label}>
          Base URL
        </label>
        <select
          id="baseUrl"
          value={settings.baseUrl}
          onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
          className={styles.select}
        >
          <option value="https://api.openai.com/v1">OpenAI API</option>
          <option value="http://localhost:11434/v1">Ollama (Local)</option>
          <option value="http://localhost:1234/v1">LM Studio (Local)</option>
        </select>
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="model" className={styles.label}>
          Model
        </label>
        <input
          id="model"
          type="text"
          value={settings.model}
          onChange={(e) => setSettings({ ...settings, model: e.target.value })}
          className={styles.input}
          placeholder="e.g., gpt-4o, llama3.1:8b"
        />
      </div>

      

      <div className={styles.buttonGroup}>
        <button
          onClick={handleTest}
          disabled={isTesting || !settings.apiKey || !settings.baseUrl}
          className={`${styles.button} ${styles.testButton}`}
        >
          {isTesting ? 'Testing...' : 'Test Connection'}
        </button>
        
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`${styles.button} ${styles.saveButton}`}
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {testResult && (
        <div className={`${styles.statusMessage} ${testResult.success ? styles.success : styles.error}`}>
          {testResult.success ? (
            <Check className={styles.icon} />
          ) : (
            <AlertCircle className={styles.icon} />
          )}
          <span className={styles.statusText}>
            {testResult.message}
          </span>
        </div>
      )}

      {saveStatus !== 'idle' && (
        <div className={`${styles.statusMessage} ${saveStatus === 'success' ? styles.success : styles.error}`}>
          {saveStatus === 'success' ? (
            <Check className={styles.icon} />
          ) : (
            <AlertCircle className={styles.icon} />
          )}
          <span className={styles.statusText}>
            {saveStatus === 'success' ? 'Settings saved!' : 'Failed to save settings'}
          </span>
        </div>
      )}
    </div>
  );
};
