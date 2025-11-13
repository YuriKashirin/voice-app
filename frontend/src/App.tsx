import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './App.module.css';
import { Header } from './components/Header';
import { RecordButton } from './components/RecordButton';

import { ErrorMessage } from './components/ErrorMessage';
import { Settings } from './components/Settings';

interface TranscriptionResponse {
  success: boolean;
  text?: string;
  error?: string;
}

interface CleanResponse {
  success: boolean;
  text?: string;
}



function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [lastCopiedText, setLastCopiedText] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState<boolean>(false);
  const [isSettingsMode, setIsSettingsMode] = useState(false);
  
  const [isCleaningWithLLM, setIsCleaningWithLLM] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isKeyDownRef = useRef(false);
  

  

  (window as any).openSettingsMode = () => setIsSettingsMode(true);

  // Window resize effect
  useEffect(() => {
    const resizeWindow = async (isSettings: boolean) => {
      if (!window.electronAPI) return;
      
      try {
        // Define dimensions for each mode
        const dimensions = isSettings 
          ? { width: 380, height: 650 }  // Settings mode: same width, taller
          : { width: 380, height: 240 };  // Normal mode: very compact
        
        await window.electronAPI.resizeWindow(dimensions.width, dimensions.height);
      } catch (error) {
        console.error('Failed to resize window:', error);
      }
    };

    resizeWindow(isSettingsMode);
  }, [isSettingsMode]);

const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setIsCopied(true);
        setLastCopiedText(text);
        setCopyToast(true);
        setTimeout(() => {
          setIsCopied(false);
          setCopyToast(false);
        }, 2000);
      })
      .catch((err: Error) => setError('Copy failed: ' + err.message));
  }, []);

const uploadAudio = useCallback(async (audioBlob: Blob) => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    try {
      // In Electron, connect to the backend server
      const backendUrl = 'http://localhost:8000'; // Force use of port 8000
      const transcribeResponse = await fetch(`${backendUrl}/api/transcribe`, {
        method: 'POST',
        body: formData,
      });

      if (!transcribeResponse.ok) {
        throw new Error(
          `Transcription failed: ${transcribeResponse.statusText}`
        );
      }

      const transcribeData =
        (await transcribeResponse.json()) as TranscriptionResponse;

      if (!transcribeData.success) {
        throw new Error(transcribeData.error || 'Transcription failed');
      }

      setError(null);

      // Always use LLM to clean the text before copying
      if (transcribeData.text) {
        setIsCleaningWithLLM(true);

        // In Electron, connect to the backend server
        const backendUrl = 'http://localhost:8000'; // Force use of port 8000
        const cleanResponse = await fetch(`${backendUrl}/api/clean`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: transcribeData.text,
          }),
        });

        if (!cleanResponse.ok) {
          setIsCleaningWithLLM(false);
          setIsProcessing(false);
          throw new Error(`Cleaning failed: ${cleanResponse.statusText}`);
        }

        const cleanData = (await cleanResponse.json()) as CleanResponse;

        if (cleanData.success && cleanData.text) {
          // Automatically copy cleaned text to clipboard
          copyToClipboard(cleanData.text);
        } else {
          // Fallback to raw transcription if cleaning fails
          copyToClipboard(transcribeData.text!);
        }

        setIsCleaningWithLLM(false);
        setIsProcessing(false);
      } else {
        setIsProcessing(false);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error';
      setError('Processing failed: ' + errorMessage);
      setIsProcessing(false);
    }
  }, [copyToClipboard]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e: BlobEvent) => {
        chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await uploadAudio(blob);

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setError(null);
      setIsCleaningWithLLM(false);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error';
      setError('Microphone access denied: ' + errorMessage);
    }
  }, [uploadAudio]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
    }
  }, [isRecording]);

  

  

  // Keyboard shortcut: Hold V to record
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isProcessing || e.repeat || isKeyDownRef.current) return;

      const target = e.target as HTMLElement;
      if (
        e.key.toLowerCase() === 'v' &&
        !['INPUT', 'TEXTAREA'].includes(target.tagName)
      ) {
        e.preventDefault();
        isKeyDownRef.current = true;

        if (!isRecording) {
          void startRecording();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'v') {
        isKeyDownRef.current = false;

        if (isRecording) {
          stopRecording();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
    // startRecording and stopRecording are stable callbacks, safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, isProcessing, copyToClipboard]);

  return (
    <div className={`${styles.app} ${isSettingsMode ? styles.settingsMode : ''}`}>
      <div className={styles.container} style={isSettingsMode ? { height: '100%' } : {}}>
        <Header 
          isSettingsMode={isSettingsMode}
          onToggleSettings={() => setIsSettingsMode(true)}
        />

        {isSettingsMode ? (
          <Settings
            isOpen={true}
            onClose={() => setIsSettingsMode(false)}
          />
        ) : (
          <RecordButton
            isRecording={isRecording}
            isProcessing={isProcessing}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
          />
        )}

        {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}
        
        {/* Copy feedback toast */}
        {copyToast && (
          <div style={{
            position: 'fixed',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'rgba(255, 255, 255, 0.9)',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: '400',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            zIndex: 1000,
          }}>
            ✓ Copied
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
