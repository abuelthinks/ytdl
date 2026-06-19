import React from 'react'
import { Folder, Globe } from 'lucide-react'
import { AppSettings } from '../types'
import { CONCURRENCY_OPTIONS, DEFAULT_CONCURRENCY } from '../constants'

interface SettingsTabProps {
  settings: AppSettings
  hasOngoingDownloads: boolean
  onSelectDownloadDir: (type: 'video' | 'music') => void
  onConcurrencyChange: (limit: number) => void
  ytdlVersionInfo: { current: string; latest: string; updateAvailable: boolean } | null
  isCheckingUpdates: boolean
  isUpdatingYtdlp: boolean
  ytdlpUpdatePercent: number
  onCheckUpdates: () => void
  onUpdateYtdlp: () => void
  onProxyUpdate: (e: React.FocusEvent<HTMLInputElement>) => void
}

export default function SettingsTab({
  settings,
  hasOngoingDownloads,
  onSelectDownloadDir,
  onConcurrencyChange,
  ytdlVersionInfo,
  isCheckingUpdates,
  isUpdatingYtdlp,
  ytdlpUpdatePercent,
  onCheckUpdates,
  onUpdateYtdlp,
  onProxyUpdate
}: SettingsTabProps): React.JSX.Element {
  const systemInfo = window.api?.systemInfo

  return (
    <div className="space-y-6">
      {/* Output Directory configuration */}
      <div className="bg-apple-card-light dark:bg-apple-card-dark border border-apple-border-light dark:border-apple-border-dark rounded-2xl p-6 space-y-6 shadow-sm">
        <div>
          <h3 className="text-sm font-semibold text-apple-text-light dark:text-apple-text-dark">
            Download Destinations
          </h3>
          <p className="text-xs text-apple-text-secondary-light dark:text-apple-text-secondary-dark mt-1">
            Choose separate local paths where your downloaded video and music files will be saved.
          </p>
        </div>
        <div className="space-y-4">
          {/* Video Folder */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-apple-text-secondary-light dark:text-apple-text-secondary-dark">
              Video Save Path
            </label>
            <div className="flex space-x-3 items-center">
              <div className="flex-1 px-4 py-2.5 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark border border-apple-border-light dark:border-apple-border-dark rounded-xl text-xs font-mono truncate text-apple-text-secondary-light dark:text-apple-text-secondary-dark">
                {settings.downloadDirVideo || 'Not Configured'}
              </div>
              <button
                type="button"
                onClick={() => onSelectDownloadDir('video')}
                className="flex items-center space-x-2 px-4 py-2.5 bg-apple-blue hover:bg-apple-blue/90 text-white rounded-xl text-xs font-semibold active:scale-[0.98] transition-all shadow-sm"
              >
                <Folder className="w-4 h-4" />
                <span>Browse...</span>
              </button>
            </div>
          </div>

          {/* Music Folder */}
          <div className="space-y-2 pt-2 border-t border-apple-border-light/50 dark:border-apple-border-dark/50">
            <label className="text-xs font-semibold text-apple-text-secondary-light dark:text-apple-text-secondary-dark">
              Music Save Path
            </label>
            <div className="flex space-x-3 items-center">
              <div className="flex-1 px-4 py-2.5 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark border border-apple-border-light dark:border-apple-border-dark rounded-xl text-xs font-mono truncate text-apple-text-secondary-light dark:text-apple-text-secondary-dark">
                {settings.downloadDirMusic || 'Not Configured'}
              </div>
              <button
                type="button"
                onClick={() => onSelectDownloadDir('music')}
                className="flex items-center space-x-2 px-4 py-2.5 bg-apple-blue hover:bg-apple-blue/90 text-white rounded-xl text-xs font-semibold active:scale-[0.98] transition-all shadow-sm"
              >
                <Folder className="w-4 h-4" />
                <span>Browse...</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Queue Concurrency Settings */}
      <div className="bg-apple-card-light dark:bg-apple-card-dark border border-apple-border-light dark:border-apple-border-dark rounded-2xl p-6 space-y-4 shadow-sm">
        <div>
          <h3 className="text-sm font-semibold text-apple-text-light dark:text-apple-text-dark">
            Queue Concurrency Limit
          </h3>
          <p className="text-xs text-apple-text-secondary-light dark:text-apple-text-secondary-dark mt-1">
            Set the maximum number of downloads that can run simultaneously. Remaining downloads
            will wait in line.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <select
            disabled={hasOngoingDownloads}
            value={settings.maxConcurrentDownloads || DEFAULT_CONCURRENCY}
            onChange={(e) => onConcurrencyChange(parseInt(e.target.value, 10))}
            className={`px-3 py-2 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark border border-apple-border-light dark:border-apple-border-dark rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all text-apple-text-light dark:text-apple-text-dark font-semibold ${
              hasOngoingDownloads ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
          >
            {CONCURRENCY_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} Concurrent Download{n > 1 ? 's' : ''}
                {n === DEFAULT_CONCURRENCY ? ' (Default)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* yt-dlp Update Manager */}
      <div className="bg-apple-card-light dark:bg-apple-card-dark border border-apple-border-light dark:border-apple-border-dark rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-sm font-semibold text-apple-text-light dark:text-apple-text-dark">
              yt-dlp Engine Updates
            </h3>
            <p className="text-xs text-apple-text-secondary-light dark:text-apple-text-secondary-dark mt-1">
              Check for and install updates to the core download engine to maintain compatibility.
            </p>
          </div>
          <button
            type="button"
            onClick={onCheckUpdates}
            disabled={isCheckingUpdates || isUpdatingYtdlp}
            className="px-3 py-1.5 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark border border-apple-border-light dark:border-apple-border-dark text-apple-text-light dark:text-apple-text-dark rounded-xl text-xs font-semibold hover:bg-apple-border-light dark:hover:bg-apple-border-dark disabled:opacity-50 transition-all cursor-pointer"
          >
            {isCheckingUpdates ? 'Checking...' : 'Check for Updates'}
          </button>
        </div>

        <div className="text-xs space-y-2 mt-2 pt-2 border-t border-apple-border-light/50 dark:border-apple-border-dark/50">
          <div className="flex justify-between py-1">
            <span className="text-apple-text-secondary-light dark:text-apple-text-secondary-dark">
              Installed Version
            </span>
            <span className="font-medium text-apple-text-light dark:text-apple-text-dark font-mono">
              {ytdlVersionInfo?.current || 'Unknown'}
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-apple-text-secondary-light dark:text-apple-text-secondary-dark">
              Latest Available
            </span>
            <span className="font-medium text-apple-text-light dark:text-apple-text-dark font-mono">
              {ytdlVersionInfo?.latest || 'Unknown'}
            </span>
          </div>

          {ytdlVersionInfo?.updateAvailable && !isUpdatingYtdlp && (
            <div className="bg-apple-blue/10 border border-apple-blue/20 text-apple-blue dark:text-apple-blue rounded-xl p-3 flex justify-between items-center mt-3">
              <div>
                <p className="font-semibold text-xs text-apple-blue">New Update Available!</p>
                <p className="text-[10px] opacity-80 text-apple-text-secondary-light dark:text-apple-text-secondary-dark">
                  Version {ytdlVersionInfo.latest} is ready to install.
                </p>
              </div>
              <button
                type="button"
                onClick={onUpdateYtdlp}
                className="px-4 py-2 bg-apple-blue hover:bg-apple-blue/90 text-white rounded-xl text-xs font-semibold active:scale-[0.98] transition-all shadow-sm cursor-pointer"
              >
                Update Now
              </button>
            </div>
          )}

          {isUpdatingYtdlp && (
            <div className="bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark border border-apple-border-light dark:border-apple-border-dark rounded-xl p-4 space-y-2 mt-3">
              <div className="flex justify-between font-semibold">
                <span>Updating yt-dlp...</span>
                <span>{ytdlpUpdatePercent}%</span>
              </div>
              <div className="w-full bg-apple-border-light dark:bg-apple-border-dark rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-apple-blue h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${ytdlpUpdatePercent}%` }}
                ></div>
              </div>
            </div>
          )}

          {ytdlVersionInfo && !ytdlVersionInfo.updateAvailable && ytdlVersionInfo.current && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 rounded-xl p-3 text-xs">
              <p className="font-semibold">You&apos;re all set!</p>
              <p className="text-[10px] opacity-80 font-medium">yt-dlp is up to date.</p>
            </div>
          )}
        </div>
      </div>

      {/* Connection Proxy configuration */}
      <div className="bg-apple-card-light dark:bg-apple-card-dark border border-apple-border-light dark:border-apple-border-dark rounded-2xl p-6 space-y-4 shadow-sm">
        <div>
          <h3 className="text-sm font-semibold text-apple-text-light dark:text-apple-text-dark">
            Network Proxy (Optional)
          </h3>
          <p className="text-xs text-apple-text-secondary-light dark:text-apple-text-secondary-dark mt-1">
            Enter a proxy URL (e.g. socks5://127.0.0.1:1080 or http://127.0.0.1:8080) if required to
            access media downloads.
          </p>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-apple-text-secondary-light dark:text-apple-text-secondary-dark">
            <Globe className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="socks5://127.0.0.1:1080"
            defaultValue={settings.proxy}
            onBlur={onProxyUpdate}
            className="w-full pl-9 pr-4 py-2.5 bg-apple-gray-bg-light dark:bg-apple-gray-bg-dark border border-apple-border-light dark:border-apple-border-dark rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
          />
        </div>
      </div>

      {/* System info */}
      <div className="bg-apple-card-light dark:bg-apple-card-dark border border-apple-border-light dark:border-apple-border-dark rounded-2xl p-6 space-y-2 shadow-sm">
        <h3 className="text-sm font-semibold text-apple-text-light dark:text-apple-text-dark">
          Application Information
        </h3>
        <div className="text-xs text-apple-text-secondary-light dark:text-apple-text-secondary-dark space-y-1 mt-2">
          <div className="flex justify-between py-1 border-b border-apple-border-light/50 dark:border-apple-border-dark/50">
            <span>Platform</span>
            <span className="font-medium capitalize text-apple-text-light dark:text-apple-text-dark">
              {systemInfo?.platform || 'Web Preview'}
            </span>
          </div>
          <div className="flex justify-between py-1 border-b border-apple-border-light/50 dark:border-apple-border-dark/50">
            <span>Node.js</span>
            <span className="font-medium text-apple-text-light dark:text-apple-text-dark">
              {systemInfo?.nodeVersion || 'N/A'}
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span>Electron</span>
            <span className="font-medium text-apple-text-light dark:text-apple-text-dark">
              {systemInfo?.electronVersion || 'N/A'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
