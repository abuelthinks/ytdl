import React from 'react'
import { FolderOpen, Play, Film, Music, AlertCircle, Sparkles } from 'lucide-react'

export interface HistoryItem {
  id: string
  url: string
  title: string
  fileName: string
  filePath: string
  fileSize: string
  date: string
  format: 'mp4' | 'mp3' | 'best'
  status: 'completed' | 'failed' | 'downloading'
}

interface HistoryListProps {
  history: HistoryItem[]
  onPlay: (filePath: string) => void
  onShowInFolder: (filePath: string) => void
}

export default function HistoryList({
  history,
  onPlay,
  onShowInFolder
}: HistoryListProps): React.JSX.Element {
  // Filter out items that are still downloading/active since they belong in the queue
  const completedHistory = history.filter((item) => item.status !== 'downloading')

  if (completedHistory.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-apple-gray-bg-light/30 dark:bg-apple-gray-bg-dark/10 border border-dashed border-apple-border-light dark:border-apple-border-dark rounded-2xl">
        <Sparkles className="w-8 h-8 text-apple-text-secondary-light/40 dark:text-apple-text-secondary-dark/40 mb-2" />
        <span className="text-sm font-medium text-apple-text-secondary-light dark:text-apple-text-secondary-dark">
          No download history
        </span>
        <span className="text-xs text-apple-text-secondary-light/60 dark:text-apple-text-secondary-dark/60 mt-1">
          Your downloaded files will appear here.
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {completedHistory.map((item) => {
        const isAudio = item.format === 'mp3'
        const isSuccess = item.status === 'completed'

        return (
          <div
            key={item.id}
            className="flex items-center justify-between p-4 bg-apple-card-light dark:bg-apple-card-dark border border-apple-border-light dark:border-apple-border-dark rounded-2xl shadow-sm hover:shadow-md transition-all duration-200"
          >
            {/* Format Icon & Info */}
            <div className="flex items-center space-x-3 min-w-0 flex-1 pr-4">
              <div
                className={`p-2.5 rounded-xl flex-shrink-0 ${
                  !isSuccess
                    ? 'bg-red-500/10 text-red-500'
                    : isAudio
                      ? 'bg-amber-500/10 text-amber-500'
                      : 'bg-apple-blue/10 text-apple-blue'
                }`}
              >
                {!isSuccess ? (
                  <AlertCircle className="w-5 h-5" />
                ) : isAudio ? (
                  <Music className="w-5 h-5" />
                ) : (
                  <Film className="w-5 h-5" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h4
                  className={`text-sm font-medium truncate ${
                    isSuccess
                      ? 'text-apple-text-light dark:text-apple-text-dark'
                      : 'text-apple-text-secondary-light/70 dark:text-apple-text-secondary-dark/70 line-through'
                  }`}
                  title={item.title || item.fileName}
                >
                  {item.title || item.fileName}
                </h4>

                <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-apple-text-secondary-light dark:text-apple-text-secondary-dark mt-0.5 opacity-80">
                  <span>{item.date}</span>
                  {isSuccess && (
                    <>
                      <span>•</span>
                      <span>{item.fileSize}</span>
                      <span>•</span>
                      <span className="uppercase font-semibold text-[10px] tracking-wide bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark px-1.5 py-0.2 rounded-md">
                        {item.format === 'best' ? 'best' : item.format}
                      </span>
                    </>
                  )}
                  {!isSuccess && (
                    <>
                      <span>•</span>
                      <span className="text-red-500 font-semibold">Failed</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            {isSuccess && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => onShowInFolder(item.filePath)}
                  className="p-2 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark hover:bg-apple-border-light dark:hover:bg-apple-border-dark text-apple-text-light dark:text-apple-text-dark rounded-xl transition-all active:scale-95"
                  title="Show in Folder"
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onPlay(item.filePath)}
                  className="p-2 bg-apple-blue hover:bg-apple-blue/90 text-white rounded-xl transition-all active:scale-95 flex items-center justify-center"
                  title="Play File"
                >
                  <Play className="w-4 h-4 fill-current" />
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
