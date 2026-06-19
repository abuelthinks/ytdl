import React, { useEffect, useState } from 'react'
import { Download, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'

interface BinaryStatusModalProps {
  onComplete: () => void
}

interface BinaryProgress {
  name: string
  status: 'pending' | 'downloading' | 'completed' | 'failed'
  percent: number
  error?: string
}

export default function BinaryStatusModal({
  onComplete
}: BinaryStatusModalProps): React.JSX.Element {
  const [ytdlpProgress, setYtdlpProgress] = useState<BinaryProgress>({
    name: 'yt-dlp',
    status: 'pending',
    percent: 0
  })

  const [ffmpegProgress, setFfmpegProgress] = useState<BinaryProgress>({
    name: 'FFmpeg',
    status: 'pending',
    percent: 0
  })

  const [isDownloading, setIsDownloading] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  useEffect(() => {
    // Listen to updates from the main process
    const unsubscribe = window.api.onBinaryStatusUpdate((data) => {
      const update = {
        name: data.name,
        status: data.status,
        percent: data.percent,
        error: data.error
      }

      if (data.name === 'yt-dlp') {
        setYtdlpProgress(update)
      } else if (data.name === 'FFmpeg') {
        setFfmpegProgress(update)
      } else if (data.name === 'Error') {
        setGlobalError(data.error || 'An unexpected error occurred.')
      }
    })

    // Start the download immediately
    startSetup()

    return () => {
      unsubscribe()
    }
  }, [])

  const startSetup = async (): Promise<void> => {
    setIsDownloading(true)
    setGlobalError(null)

    setYtdlpProgress({ name: 'yt-dlp', status: 'pending', percent: 0 })
    setFfmpegProgress({ name: 'FFmpeg', status: 'pending', percent: 0 })

    const result = await window.api.downloadBinaries()
    setIsDownloading(false)

    if (result.success) {
      onComplete()
    } else {
      setGlobalError(result.error || 'Failed to download one or more required binaries.')
    }
  }

  const getStatusIcon = (status: BinaryProgress['status']): React.ReactNode => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />
      case 'downloading':
        return <Loader2 className="w-5 h-5 text-apple-blue animate-spin" />
      case 'failed':
        return <AlertTriangle className="w-5 h-5 text-red-500" />
      default:
        return (
          <Download className="w-5 h-5 text-apple-text-secondary-light dark:text-apple-text-secondary-dark" />
        )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-apple-card-light dark:bg-apple-card-dark border border-apple-border-light dark:border-apple-border-dark rounded-2xl p-6 shadow-2xl flex flex-col items-center">
        <div className="w-12 h-12 rounded-full bg-apple-blue/10 flex items-center justify-center mb-4">
          <Download className="w-6 h-6 text-apple-blue" />
        </div>

        <h2 className="text-xl font-semibold text-apple-text-light dark:text-apple-text-dark mb-1">
          Configuring Application
        </h2>
        <p className="text-sm text-apple-text-secondary-light dark:text-apple-text-secondary-dark text-center mb-6 px-4">
          We are downloading and configuring the latest versions of{' '}
          <code className="bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark px-1.5 py-0.5 rounded text-xs">
            yt-dlp
          </code>{' '}
          and{' '}
          <code className="bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark px-1.5 py-0.5 rounded text-xs">
            ffmpeg
          </code>{' '}
          to merge video and audio.
        </p>

        {/* Binary Setup Cards */}
        <div className="w-full space-y-4 mb-6">
          {/* yt-dlp Setup */}
          <div className="p-4 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark/50 rounded-xl border border-apple-border-light dark:border-apple-border-dark">
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium text-sm text-apple-text-light dark:text-apple-text-dark">
                yt-dlp (YouTube Engine)
              </span>
              {getStatusIcon(ytdlpProgress.status)}
            </div>

            <div className="w-full bg-apple-border-light dark:bg-apple-border-dark rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-apple-blue h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${ytdlpProgress.percent}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-xs text-apple-text-secondary-light dark:text-apple-text-secondary-dark mt-1">
              <span>
                {ytdlpProgress.status === 'downloading'
                  ? 'Downloading...'
                  : ytdlpProgress.status === 'completed'
                    ? 'Installed'
                    : 'Waiting...'}
              </span>
              <span>{ytdlpProgress.percent}%</span>
            </div>
          </div>

          {/* ffmpeg Setup */}
          <div className="p-4 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark/50 rounded-xl border border-apple-border-light dark:border-apple-border-dark">
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium text-sm text-apple-text-light dark:text-apple-text-dark">
                FFmpeg (Media Merger)
              </span>
              {getStatusIcon(ffmpegProgress.status)}
            </div>

            <div className="w-full bg-apple-border-light dark:bg-apple-border-dark rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-apple-blue h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${ffmpegProgress.percent}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-xs text-apple-text-secondary-light dark:text-apple-text-secondary-dark mt-1">
              <span>
                {ffmpegProgress.status === 'downloading'
                  ? 'Downloading & Extracting...'
                  : ffmpegProgress.status === 'completed'
                    ? 'Installed'
                    : 'Waiting...'}
              </span>
              <span>{ffmpegProgress.percent}%</span>
            </div>
          </div>
        </div>

        {globalError && (
          <div className="w-full bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl p-3 text-sm text-center mb-6">
            <p className="font-medium mb-1">Configuration Failed</p>
            <p className="text-xs opacity-90">{globalError}</p>
          </div>
        )}

        {/* Footer Actions */}
        {!isDownloading && globalError && (
          <button
            onClick={startSetup}
            className="w-full py-2.5 bg-apple-blue text-white rounded-xl text-sm font-medium hover:bg-apple-blue/90 active:scale-[0.98] transition-all"
          >
            Retry Installation
          </button>
        )}

        {isDownloading && (
          <p className="text-xs text-apple-text-secondary-light dark:text-apple-text-secondary-dark animate-pulse">
            Do not close the application...
          </p>
        )}
      </div>
    </div>
  )
}
