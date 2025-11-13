import { Settings2 } from 'lucide-react';
import styles from './Header.module.css';
import type { HeaderProps } from '../types';

export function Header({ isSettingsMode, onToggleSettings }: { isSettingsMode?: boolean; onToggleSettings: () => void } & HeaderProps) {
  return (
    <>
      {!isSettingsMode ? (
        <button
          onClick={onToggleSettings}
          className={styles.settingsButton}
          aria-label="Open settings"
        >
          <Settings2 className={styles.settingsIcon} />
        </button>
      ) : (
        <div className={styles.settingsButton} style={{ visibility: 'hidden' }}>
          <Settings2 className={styles.settingsIcon} />
        </div>
      )}
    </>
  );
}
