import styles from './TranscriptionResults.module.css';
import type { TranscriptionResultsProps } from '../types';
import { TextBox } from './TextBox';

export function TranscriptionResults({
  rawText,
  cleanedText,
  useLLM,
  isCopied,
  isCleaningWithLLM,
  isProcessing,
  onCopy,
}: TranscriptionResultsProps) {
  // Only show component when not processing and we have cleaned text
  if (isProcessing || !cleanedText || isCleaningWithLLM) {
    return null;
  }

  const displayText = useLLM && cleanedText ? cleanedText : rawText;

  return (
    <div className={styles.container}>
      {/* Cleaned transcription (only when complete) */}
      {useLLM && cleanedText && (
        <TextBox
          mode="display"
          variant="default"
          value={cleanedText}
          isLoading={false}
          showCopyButton={true}
          isCopied={isCopied}
          onCopy={() => onCopy(cleanedText)}
          maxHeight="300px"
        />
      )}

      {/* Copy button for non-LLM case */}
      {!useLLM && displayText && (
        <TextBox
          mode="display"
          variant="default"
          value={displayText}
          showCopyButton={true}
          isCopied={isCopied}
          onCopy={() => onCopy(displayText)}
          maxHeight="300px"
        />
      )}
    </div>
  );
}
