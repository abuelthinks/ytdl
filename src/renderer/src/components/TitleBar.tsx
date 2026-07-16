import React, { useState } from 'react'
import {
  Download,
  History,
  Settings,
  Minus,
  Square,
  X,
  Maximize2,
  PanelLeft,
  PanelRight,
  PictureInPicture2,
  Sun,
  Moon,
  Monitor
} from 'lucide-react'

export type AppMode = 'full' | 'mini' | 'dock'
export type TabId = 'download' | 'history' | 'settings'
export type Theme = 'light' | 'dark' | 'system'

interface TitleBarProps {
  mode: AppMode
  activeTab?: TabId
  onTabChange?: (tab: TabId) => void
  activeCount?: number
  dockSide?: 'left' | 'right' | null
  onDock?: (side: 'left' | 'right' | null) => void
  onExpand?: () => void
  onMini?: () => void
  theme?: Theme
  onCycleTheme?: () => void
}

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'download', label: 'Downloads', icon: Download },
  { id: 'history', label: 'History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings }
]

const controlBtn =
  'app-no-drag flex items-center justify-center w-10 h-9 text-apple-text-secondary-light dark:text-apple-text-secondary-dark hover:bg-apple-gray-bg-light dark:hover:bg-apple-gray-bg-dark hover:text-apple-text-light dark:hover:text-apple-text-dark transition-colors'

const iconBtn =
  'app-no-drag flex items-center justify-center w-8 h-7 rounded-lg text-apple-text-secondary-light dark:text-apple-text-secondary-dark hover:bg-apple-gray-bg-light dark:hover:bg-apple-gray-bg-dark hover:text-apple-text-light dark:hover:text-apple-text-dark transition-colors'

export default function TitleBar({
  mode,
  activeTab,
  onTabChange,
  activeCount = 0,
  dockSide,
  onDock,
  onExpand,
  onMini,
  theme,
  onCycleTheme
}: TitleBarProps): React.JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)

  const handleMinimize = (): void => {
    window.api?.windowMinimize?.()
  }

  const handleMaximize = async (): Promise<void> => {
    if (window.api?.windowMaximizeToggle) {
      setIsMaximized(await window.api.windowMaximizeToggle())
    }
  }

  const handleClose = (): void => {
    window.api?.windowClose?.()
  }

  return (
    <header className="app-drag h-9 flex items-center justify-between bg-apple-card-light dark:bg-apple-card-dark border-b border-apple-border-light dark:border-apple-border-dark flex-shrink-0">
      {/* Logo / brand */}
      <div className="flex items-center space-x-2 pl-3 min-w-0">
        <div className="w-5 h-5 rounded-md bg-apple-blue flex items-center justify-center flex-shrink-0">
          <Download className="w-3 h-3 text-white" />
        </div>
        {mode === 'full' && (
          <span className="text-xs font-semibold tracking-tight text-apple-text-light dark:text-apple-text-dark whitespace-nowrap">
            Media Downloader
          </span>
        )}
        {mode === 'mini' && (
          <span className="text-xs font-semibold text-apple-text-light dark:text-apple-text-dark whitespace-nowrap">
            {activeCount > 0 ? `${activeCount} active` : 'Downloader'}
          </span>
        )}
        {mode === 'dock' && (
          <span className="text-xs font-semibold text-apple-text-light dark:text-apple-text-dark whitespace-nowrap">
            Queue
          </span>
        )}
      </div>

      {/* Tabs (full mode only) */}
      {mode === 'full' && onTabChange && (
        <nav className="app-no-drag flex items-center space-x-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                activeTab === id
                  ? 'bg-apple-blue/10 text-apple-blue'
                  : 'text-apple-text-secondary-light dark:text-apple-text-secondary-dark hover:bg-apple-gray-bg-light dark:hover:bg-apple-gray-bg-dark hover:text-apple-text-light dark:hover:text-apple-text-dark'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* Mode + window controls */}
      <div className="flex items-center h-full">
        {onCycleTheme && (
          <button
            onClick={onCycleTheme}
            className={iconBtn}
            title={`Theme: ${theme || 'system'} (click to change)`}
          >
            {theme === 'light' ? (
              <Sun className="w-3.5 h-3.5" />
            ) : theme === 'dark' ? (
              <Moon className="w-3.5 h-3.5" />
            ) : (
              <Monitor className="w-3.5 h-3.5" />
            )}
          </button>
        )}
        {mode === 'full' && (onMini || onDock) && (
          <div className="flex items-center space-x-0.5 pr-2 mr-1 border-r border-apple-border-light dark:border-apple-border-dark">
            {onMini && (
              <button onClick={onMini} className={iconBtn} title="Mini mode">
                <PictureInPicture2 className="w-3.5 h-3.5" />
              </button>
            )}
            {onDock && (
              <>
                <button
                  onClick={() => onDock('left')}
                  className={iconBtn}
                  title="Dock to left edge"
                >
                  <PanelLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDock('right')}
                  className={iconBtn}
                  title="Dock to right edge"
                >
                  <PanelRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        )}
        {(mode === 'mini' || mode === 'dock') && (
          <button
            onClick={() => {
              if (mode === 'dock' && onDock) {
                onDock(null)
              } else if (onExpand) {
                onExpand()
              }
            }}
            className={iconBtn}
            title={mode === 'dock' ? 'Undock window' : 'Expand window'}
          >
            {mode === 'dock' ? (
              dockSide === 'left' ? (
                <PanelRight className="w-3.5 h-3.5" />
              ) : (
                <PanelLeft className="w-3.5 h-3.5" />
              )
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        )}

        <button onClick={handleMinimize} className={controlBtn} title="Minimize">
          <Minus className="w-3.5 h-3.5" />
        </button>
        {mode === 'full' && (
          <button
            onClick={handleMaximize}
            className={controlBtn}
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            <Square className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={handleClose}
          className="app-no-drag flex items-center justify-center w-10 h-9 text-apple-text-secondary-light dark:text-apple-text-secondary-dark hover:bg-red-500 hover:text-white transition-colors"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  )
}
