import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './App.module.css';
import { Header } from './components/Header';
import { RecordButton } from './components/RecordButton';


import { TranscriptionResults } from './components/TranscriptionResults';
import { ErrorMessage } from './components/ErrorMessage';

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
  const [rawText, setRawText] = useState<string | null>(null);
  const [cleanedText, setCleanedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const useLLM = true;
  const [isCopied, setIsCopied] = useState(false);
  
  const [isCleaningWithLLM, setIsCleaningWithLLM] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isKeyDownRef = useRef(false);
  

  

  const uploadAudio = useCallback(async (audioBlob: Blob) => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    try {
      const transcribeResponse = await fetch('/api/transcribe', {
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

      setRawText(transcribeData.text || '');
      setError(null);

      if (useLLM && transcribeData.text) {
        setIsCleaningWithLLM(true);

        const cleanResponse = await fetch('/api/clean', {
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
          setCleanedText(cleanData.text);
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
  }, [useLLM]);

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
      setRawText(null);
      setCleanedText(null);
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

  

  const copyToClipboard = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch((err: Error) => setError('Copy failed: ' + err.message));
  };

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
  }, [isRecording, isProcessing]);

  return (
    <div className={styles.app}>
      <div className={styles.container}>
        <Header />

        <RecordButton
          isRecording={isRecording}
          isProcessing={isProcessing}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
        />

        

        

        {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

        <TranscriptionResults
          rawText={rawText}
          cleanedText={cleanedText}
          useLLM={useLLM}
          isCopied={isCopied}
          isCleaningWithLLM={isCleaningWithLLM}
          isProcessing={isProcessing}
          onCopy={copyToClipboard}
        />
      </div>
    </div>
  );
}

export default App;
