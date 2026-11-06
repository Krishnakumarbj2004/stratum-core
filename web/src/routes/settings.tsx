// src/routes/settings.tsx
import { useState, useEffect, useCallback, useId } from 'react'
import {
  Save,
  Check,
  Loader2,
  AlertCircle,
  Key,
  Calendar,
  CheckCircle,
  Bell,
  X,
  Sparkles,
  Settings as SettingsIcon,
} from 'lucide-react'
import { useProject } from '../context/ProjectContext'

interface AppConfig {
  api?: {
    keys?: string[]
    email?: string
  }
  filters?: {
    date_from?: string
    date_to?: string
    doc_types?: string[]
  }
  output?: {
    jsonl_dir?: string
    db_dir?: string
  }
  keywords?: string
  topics?: string[]
  anchors?: string[]
}

interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  title: string
  message: string
}

interface AlertModalConfig {
  type: 'error' | 'success' | 'info'
  title: string
  message: string
}

export function Settings() {
  const { activeProject } = useProject()
  const instanceId = useId()

  const [appConfig, setAppConfig] = useState<AppConfig | null>(null)
  const [existingKeywords, setExistingKeywords] = useState('')
  const [existingTopics, setExistingTopics] = useState('')
  const [existingAnchors, setExistingAnchors] = useState('')

  // Settings State (with persistent localStorage defaults)
  const [apiKeysStr, setApiKeysStr] = useState(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('stratum_api_keys') || '' : ''
  })
  const [apiEmail, setApiEmail] = useState(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('stratum_api_email') || '' : ''
  })
  const [dateFrom, setDateFrom] = useState(() => {
    return typeof window !== 'undefined'
      ? localStorage.getItem('stratum_date_from') || '2003-01-01'
      : '2003-01-01'
  })
  const [dateTo, setDateTo] = useState(() => {
    return typeof window !== 'undefined'
      ? localStorage.getItem('stratum_date_to') || '2024-12-31'
      : '2024-12-31'
  })
  const [selectedDocTypes, setSelectedDocTypes] = useState<Record<string, boolean>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('stratum_doc_types')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          if (parsed['proceedings-article'] !== undefined) {
            parsed['conference-paper'] = parsed['proceedings-article']
            delete parsed['proceedings-article']
          }
          return parsed
        } catch {
          // ignore
        }
      }
    }
    return {
      article: true,
      review: true,
      'conference-paper': true,
      preprint: false,
      'book-chapter': false,
      dataset: false,
    }
  })

  // LLM Settings State
  const [llmProvider, setLlmProvider] = useState<'gemini' | 'ollama'>(() => {
    return (
      (typeof window !== 'undefined'
        ? (localStorage.getItem('stratum_llm_provider') as 'gemini' | 'ollama')
        : null) || 'gemini'
    )
  })
  const [llmApiKey, setLlmApiKey] = useState(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('stratum_gemini_key') || '' : ''
  })
  const [llmModel, setLlmModel] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('stratum_gemini_model')
      if (saved && (saved.startsWith('gemini') || saved.startsWith('models/gemini'))) {
        return saved
      }
    }
    return 'gemini-3.6-flash'
  })
  const [ollamaModel, setOllamaModel] = useState(() => {
    return typeof window !== 'undefined'
      ? localStorage.getItem('stratum_ollama_model') || 'qwen3:4b'
      : 'qwen3:4b'
  })
  const [ollamaUrl, setOllamaUrl] = useState(() => {
    return typeof window !== 'undefined'
      ? localStorage.getItem('stratum_ollama_url') || 'http://localhost:11434'
      : 'http://localhost:11434'
  })
  const [domainContext, setDomainContext] = useState(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('stratum_domain_context') || '' : ''
  })

  // Loading & Saving Status
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Toast Notifications
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback(
    (type: 'success' | 'error' | 'info', title: string, message: string) => {
      const id = `${instanceId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      setToasts((prev) => [...prev, { id, type, title, message }])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 6000)
    },
    [instanceId],
  )

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  // Alert Dialog
  const [alertConfig, setAlertConfig] = useState<AlertModalConfig | null>(null)

  // Notification Permission
  const [notificationPermission, setNotificationPermission] = useState<
    'granted' | 'denied' | 'default' | 'unsupported'
  >(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission
    }
    return 'unsupported'
  })

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) return
    try {
      const permission = await Notification.requestPermission()
      setNotificationPermission(permission)
      if (permission === 'granted') {
        addToast(
          'success',
          'Desktop Notifications Enabled',
          'You will now receive desktop notifications when processes finish.',
        )
      }
    } catch (err) {
      console.error('Failed to request notification permission:', err)
    }
  }

  const sendTestNotification = () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('Stratum Notification', {
          body: 'Desktop notifications are working properly!',
        })
      } catch (err) {
        console.error('Failed to trigger notification:', err)
      }
    }
  }

  // Fetch Config
  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/config?project=${activeProject}`)
      if (response.ok) {
        const data = await response.json()
        const cfg = data.config
        setAppConfig(cfg)
        setExistingKeywords(data.keywords || '')
        setExistingTopics(data.topics || '')
        setExistingAnchors(data.anchors || '')

        if (cfg) {
          const loadedKeys = cfg.api?.keys?.join(', ') || ''
          const loadedEmail = cfg.api?.email || ''
          const loadedDateFrom = cfg.filters?.date_from || '2003-01-01'
          const loadedDateTo = cfg.filters?.date_to || '2024-12-31'

          // Use server keys if present, otherwise fallback to persistent localStorage defaults
          const effectiveKeys =
            loadedKeys ||
            (typeof window !== 'undefined' ? localStorage.getItem('stratum_api_keys') || '' : '')
          const effectiveEmail =
            loadedEmail ||
            (typeof window !== 'undefined' ? localStorage.getItem('stratum_api_email') || '' : '')
          const effectiveDateFrom =
            loadedDateFrom !== '2003-01-01'
              ? loadedDateFrom
              : (typeof window !== 'undefined'
                  ? localStorage.getItem('stratum_date_from') || loadedDateFrom
                  : loadedDateFrom)
          const effectiveDateTo =
            loadedDateTo !== '2024-12-31'
              ? loadedDateTo
              : (typeof window !== 'undefined'
                  ? localStorage.getItem('stratum_date_to') || loadedDateTo
                  : loadedDateTo)

          setApiKeysStr(effectiveKeys)
          setApiEmail(effectiveEmail)
          setDateFrom(effectiveDateFrom)
          setDateTo(effectiveDateTo)

          if (typeof window !== 'undefined') {
            if (effectiveKeys) localStorage.setItem('stratum_api_keys', effectiveKeys)
            if (effectiveEmail) localStorage.setItem('stratum_api_email', effectiveEmail)
            if (effectiveDateFrom) localStorage.setItem('stratum_date_from', effectiveDateFrom)
            if (effectiveDateTo) localStorage.setItem('stratum_date_to', effectiveDateTo)
          }

          const types = cfg.filters?.doc_types || []
          if (types.length > 0) {
            const typeMap: Record<string, boolean> = {
              article: false,
              review: false,
              'conference-paper': false,
              preprint: false,
              'book-chapter': false,
              dataset: false,
            }
            types.forEach((t: string) => {
              const mapped = t === 'proceedings-article' ? 'conference-paper' : t
              typeMap[mapped] = true
            })
            setSelectedDocTypes(typeMap)
            if (typeof window !== 'undefined') {
              localStorage.setItem('stratum_doc_types', JSON.stringify(typeMap))
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to load configuration:', err)
      addToast('error', 'Load Failed', 'Could not fetch project settings.')
    } finally {
      setLoading(false)
    }
  }, [activeProject, addToast])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchConfig()
  }, [fetchConfig])

  // Save Settings
  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setSaving(true)
    setSaveSuccess(false)

    // Save all credentials and settings to localStorage for persistent cross-project recall
    if (typeof window !== 'undefined') {
      localStorage.setItem('stratum_api_keys', apiKeysStr)
      localStorage.setItem('stratum_api_email', apiEmail)
      localStorage.setItem('stratum_date_from', dateFrom)
      localStorage.setItem('stratum_date_to', dateTo)
      localStorage.setItem('stratum_doc_types', JSON.stringify(selectedDocTypes))
      localStorage.setItem('stratum_llm_provider', llmProvider)
      localStorage.setItem('stratum_gemini_key', llmApiKey)
      localStorage.setItem('stratum_gemini_model', llmModel)
      localStorage.setItem('stratum_ollama_url', ollamaUrl)
      localStorage.setItem('stratum_ollama_model', ollamaModel)
      localStorage.setItem('stratum_domain_context', domainContext)
    }

    const keysList = apiKeysStr
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    const docTypesList = Object.keys(selectedDocTypes).filter((k) => selectedDocTypes[k])

    const updatedConfig = {
      ...appConfig,
      api: {
        ...appConfig?.api,
        keys: keysList,
        email: apiEmail.trim(),
      },
      filters: {
        ...appConfig?.filters,
        date_from: dateFrom,
        date_to: dateTo,
        doc_types: docTypesList,
      },
    }

    try {
      const response = await fetch(`/api/config?project=${activeProject}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: updatedConfig,
          keywords: existingKeywords,
          topics: existingTopics,
          anchors: existingAnchors,
          label: 'Updated system settings',
        }),
      })

      if (response.ok) {
        setSaveSuccess(true)
        addToast(
          'success',
          'Settings Saved & Synchronized',
          'Credentials and settings have been saved and applied across all projects.',
        )
        fetchConfig()
        setTimeout(() => setSaveSuccess(false), 4000)
      } else {
        const errData = await response.json().catch(() => ({}))
        const errMsg = errData.error || response.statusText || 'Unknown error occurred while saving.'
        setAlertConfig({
          type: 'error',
          title: 'Save Settings Failed',
          message: errMsg,
        })
        addToast('error', 'Save Failed', errMsg)
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setAlertConfig({
        type: 'error',
        title: 'Save Settings Failed',
        message: errMsg,
      })
      addToast('error', 'Save Failed', errMsg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto relative select-text">
      {/* Floating Toast Notification Alerts */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-3 w-80 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`p-4 rounded-lg shadow-lg border text-xs font-mono flex items-start justify-between gap-3 pointer-events-auto transition-all duration-300 animate-slide-in ${
              toast.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : toast.type === 'error'
                  ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                  : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'
            }`}
          >
            <div className="flex flex-col gap-1">
              <span className="font-bold uppercase tracking-wider text-[10px]">{toast.title}</span>
              <p className="font-sans leading-relaxed text-zinc-600 dark:text-zinc-400">
                {toast.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-zinc-200 pb-5 dark:border-zinc-800 gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-mono font-bold tracking-tight text-zinc-950 dark:text-zinc-50 uppercase flex items-center gap-2.5">
              <SettingsIcon className="h-6 w-6 text-zinc-700 dark:text-zinc-300" />
              Settings
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
              Project: {activeProject}
            </span>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 font-sans">
            Configure OpenAlex API credentials, polite pool routing, search constraints, AI query
            generation, and environment preferences.
          </p>
        </div>

        {/* Top Save Button */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => handleSaveSettings()}
            disabled={saving || loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-zinc-950 dark:bg-zinc-50 text-white dark:text-zinc-950 rounded hover:bg-zinc-900 dark:hover:bg-zinc-200 font-mono text-xs font-bold uppercase cursor-pointer disabled:opacity-50 select-none shadow-sm transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving Settings...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Save Settings</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {saveSuccess && (
        <div className="flex items-center gap-3 p-4 border border-green-200 bg-green-50/50 text-green-700 dark:border-green-800/40 dark:bg-green-950/20 dark:text-green-400 font-mono text-xs rounded">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>
            [SUCCESS] Settings successfully saved and synchronized across all projects. OpenAlex
            credentials, search filters, and AI query builder configuration updated.
          </span>
        </div>
      )}

      {/* Settings Grid Form */}
      <form onSubmit={handleSaveSettings} className="w-full flex flex-col gap-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full">
          {/* LEFT COLUMN: API Keys & Polite Pool + Desktop Alerts (cols: 6) */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            {/* API Keys & Polite Pool */}
            <div className="border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-950/10 rounded flex flex-col gap-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
                <span className="text-sm font-mono font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                  <Key className="h-4 w-4 text-zinc-500" />
                  API Keys & Polite Pool
                </span>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-mono uppercase text-zinc-400 font-bold">
                    OpenAlex API Keys (Comma-separated for rotation)
                  </label>
                  <input
                    type="text"
                    value={apiKeysStr}
                    onChange={(e) => setApiKeysStr(e.target.value)}
                    placeholder="Key1, Key2, Key3..."
                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2.5 rounded font-mono text-xs focus:outline-none"
                  />
                  <span className="text-[9px] text-zinc-400 font-sans leading-normal">
                    If multiple keys are set, Stratum rotates queries across them and automatically
                    sets aside keys that encounter quota exceptions.
                  </span>
                </div>

                <div className="flex flex-col gap-1.5 mt-1 border-t border-zinc-200 dark:border-zinc-800 pt-3">
                  <label className="text-[11px] font-mono uppercase text-zinc-400 font-bold">
                    Polite Pool Email Address (Contact UserAgent)
                  </label>
                  <input
                    type="email"
                    value={apiEmail}
                    onChange={(e) => setApiEmail(e.target.value)}
                    placeholder="your.name@institution.edu"
                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2.5 rounded font-mono text-xs focus:outline-none"
                  />
                  <span className="text-[9px] text-zinc-400 font-sans leading-normal">
                    OpenAlex reserves a dedicated &quot;polite pool&quot; with faster response times for
                    users who send their contact email in the headers.
                  </span>
                </div>
              </div>
            </div>

            {/* Desktop Notifications Panel */}
            <div className="flex flex-col gap-4 border border-zinc-200 dark:border-zinc-800 p-5 rounded bg-white dark:bg-zinc-950/10 shadow-sm">
              <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                  <Bell className="h-4 w-4 text-zinc-500 animate-pulse" />
                  Desktop Alerts Setting
                </span>
                {notificationPermission === 'granted' ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 border border-emerald-200/50 font-mono text-[9px] font-bold uppercase">
                    Enabled
                  </span>
                ) : notificationPermission === 'denied' ? (
                  <span className="px-2 py-0.5 rounded bg-red-50 dark:bg-red-950/20 text-red-600 border border-red-200/50 font-mono text-[9px] font-bold uppercase">
                    Blocked
                  </span>
                ) : notificationPermission === 'unsupported' ? (
                  <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-500 font-mono text-[9px] font-bold uppercase">
                    Unsupported
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/20 text-amber-600 border border-amber-200/50 font-mono text-[9px] font-bold uppercase">
                    Setup needed
                  </span>
                )}
              </div>

              <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                Receive browser push alerts when long-running search calculations, topic details
                fetches, or pipeline syncs finish, so you are immediately notified even when working
                in other tabs.
              </p>

              <div className="flex flex-col gap-3 mt-1">
                {notificationPermission === 'default' && (
                  <button
                    type="button"
                    onClick={requestNotificationPermission}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-zinc-300 dark:border-zinc-800 rounded font-mono text-xs font-bold uppercase bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer transition select-none"
                  >
                    <Bell className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                    Request Notification Permission
                  </button>
                )}

                {notificationPermission === 'granted' && (
                  <div className="flex flex-col gap-3">
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-semibold">
                      <Check className="h-3.5 w-3.5 shrink-0" /> Desktop notifications are fully
                      configured and ready.
                    </span>
                    <button
                      type="button"
                      onClick={sendTestNotification}
                      className="self-start px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded font-mono text-[10px] font-bold uppercase hover:bg-zinc-50 dark:hover:bg-zinc-850 text-zinc-600 dark:text-zinc-400 cursor-pointer transition"
                    >
                      Send Test Notification
                    </button>
                  </div>
                )}

                {notificationPermission === 'denied' && (
                  <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 flex items-center gap-1.5 leading-normal">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Notifications are blocked. Please
                    enable them in your browser site settings to receive completion alerts.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Search Constraints & Filtering + AI & LLM + Environment (cols: 6) */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            {/* Search Constraints & Filtering */}
            <div className="flex flex-col gap-5 border border-zinc-200 dark:border-zinc-800 p-5 rounded bg-white dark:bg-zinc-950/10 shadow-sm">
              <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
                <span className="text-sm font-mono font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-zinc-500" />
                  Search Constraints & Filtering
                </span>
              </div>

              {/* Date Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-mono uppercase text-zinc-500 font-bold">
                    Publication Date From
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2 rounded font-mono text-xs focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-mono uppercase text-zinc-500 font-bold">
                    Publication Date To
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2 rounded font-mono text-xs focus:outline-none"
                  />
                </div>
              </div>

              {/* Document Types Checkboxes */}
              <div className="flex flex-col gap-2.5 mt-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <span className="text-[11px] font-mono uppercase text-zinc-500 font-bold">
                  Target Document Types
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.keys(selectedDocTypes).map((type) => (
                    <label
                      key={type}
                      className={`flex items-center gap-2 p-2 rounded border border-zinc-200 dark:border-zinc-800/80 cursor-pointer select-none font-mono text-[11px] ${
                        selectedDocTypes[type]
                          ? 'bg-zinc-50/50 border-zinc-300 dark:bg-zinc-900/10 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-semibold'
                          : 'bg-white dark:bg-zinc-950/20 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 text-zinc-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDocTypes[type]}
                        onChange={() =>
                          setSelectedDocTypes((prev) => ({
                            ...prev,
                            [type]: !prev[type],
                          }))
                        }
                        className="rounded border-zinc-300 text-zinc-900 focus:ring-0 cursor-pointer"
                      />
                      <span className="capitalize">{type.replace('-', ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* AI & LLM Query Builder Settings */}
            <div className="flex flex-col gap-4 border border-zinc-200 dark:border-zinc-800 p-5 rounded bg-white dark:bg-zinc-950/10 shadow-sm">
              <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
                <span className="text-sm font-mono font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  AI Query Builder Configuration
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {/* Provider Selection */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono font-bold uppercase text-zinc-500">
                    LLM Provider
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLlmProvider('gemini')
                        localStorage.setItem('stratum_llm_provider', 'gemini')
                      }}
                      className={`flex-1 py-1.5 border rounded font-mono text-[10px] font-bold uppercase cursor-pointer transition ${
                        llmProvider === 'gemini'
                          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 border-zinc-800'
                          : 'bg-transparent text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                      }`}
                    >
                      Gemini API
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLlmProvider('ollama')
                        localStorage.setItem('stratum_llm_provider', 'ollama')
                      }}
                      className={`flex-1 py-1.5 border rounded font-mono text-[10px] font-bold uppercase cursor-pointer transition ${
                        llmProvider === 'ollama'
                          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 border-zinc-800'
                          : 'bg-transparent text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                      }`}
                    >
                      Ollama (Local)
                    </button>
                  </div>
                </div>

                {/* Provider Config Fields */}
                {llmProvider === 'gemini' ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-mono font-bold uppercase text-zinc-500">
                        Model Selection
                      </label>
                      <select
                        value={llmModel}
                        onChange={(e) => {
                          setLlmModel(e.target.value)
                          localStorage.setItem('stratum_gemini_model', e.target.value)
                        }}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2 rounded font-mono text-xs focus:outline-none"
                      >
                        <option value="gemini-3.6-flash">
                          Gemini 3.6 Flash (Fastest & Recommended)
                        </option>
                        <option value="gemini-3.6-pro">Gemini 3.6 Pro (Deep Reasoning)</option>
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                        <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                        <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-mono font-bold uppercase text-zinc-500 flex items-center gap-1">
                        <Key className="h-3 w-3" /> Gemini API Key
                      </label>
                      <input
                        type="password"
                        value={llmApiKey}
                        onChange={(e) => {
                          setLlmApiKey(e.target.value)
                          localStorage.setItem('stratum_gemini_key', e.target.value)
                        }}
                        placeholder="Enter GEMINI_API_KEY..."
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2 rounded font-mono text-xs focus:outline-none"
                      />
                      <span className="text-[9px] text-zinc-400 font-sans">
                        Used to classify extracted keywords into the 4-bucket bounded boolean schema.
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-mono font-bold uppercase text-zinc-500">
                        Ollama Server URL
                      </label>
                      <input
                        type="text"
                        value={ollamaUrl}
                        onChange={(e) => {
                          setOllamaUrl(e.target.value)
                          localStorage.setItem('stratum_ollama_url', e.target.value)
                        }}
                        placeholder="http://localhost:11434"
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2 rounded font-mono text-xs focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-mono font-bold uppercase text-zinc-500">
                        Ollama Model Name
                      </label>
                      <input
                        type="text"
                        value={ollamaModel}
                        onChange={(e) => {
                          setOllamaModel(e.target.value)
                          localStorage.setItem('stratum_ollama_model', e.target.value)
                        }}
                        placeholder="e.g. qwen3:4b, llama3"
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2 rounded font-mono text-xs focus:outline-none"
                      />
                    </div>
                  </>
                )}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono font-bold uppercase text-zinc-500">
                    Domain Context Hint (Optional)
                  </label>
                  <input
                    type="text"
                    value={domainContext}
                    onChange={(e) => setDomainContext(e.target.value)}
                    placeholder="e.g. Quantum Computing, Materials Science"
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2 rounded font-mono text-xs focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Environment & Workspace Preferences */}
            <div className="flex flex-col gap-4 border border-zinc-200 dark:border-zinc-800 p-5 rounded bg-white dark:bg-zinc-950/10 shadow-sm">
              <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                  <SettingsIcon className="h-4 w-4 text-zinc-500" />
                  Environment & Preferences
                </span>
              </div>
              <div className="flex flex-col gap-3 text-xs font-mono text-zinc-500">
                <div className="flex justify-between items-center py-2 border-b border-zinc-100 dark:border-zinc-900">
                  <span>Active Workspace</span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200">
                    {activeProject || 'Default'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-zinc-100 dark:border-zinc-900">
                  <span>Browser Notification Support</span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200">
                    {typeof window !== 'undefined' && 'Notification' in window
                      ? 'Supported'
                      : 'Unavailable'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span>Toast Auto-Dismiss</span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200">6 seconds</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Save Bar */}
        <div className="flex items-center justify-end border-t border-zinc-200 dark:border-zinc-800 pt-5">
          <button
            type="submit"
            disabled={saving || loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-zinc-950 dark:bg-zinc-50 text-white dark:text-zinc-950 rounded hover:bg-zinc-900 dark:hover:bg-zinc-200 font-mono text-xs font-bold uppercase cursor-pointer disabled:opacity-50 select-none shadow-sm transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving Settings...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Save Settings</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Custom Themed Alert Modal */}
      {alertConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded shadow-xl overflow-hidden animate-in zoom-in-95 duration-200"
            role="alertdialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  alertConfig.type === 'success'
                    ? 'bg-emerald-500'
                    : alertConfig.type === 'error'
                      ? 'bg-red-500'
                      : 'bg-blue-500'
                }`}
              />
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                {alertConfig.title}
              </h3>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex flex-col gap-3">
              <p className="font-mono text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-350 whitespace-pre-line">
                {alertConfig.message}
              </p>
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-zinc-50 dark:bg-zinc-950/40 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
              <button
                type="button"
                onClick={() => setAlertConfig(null)}
                className="px-4 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded font-mono text-xs font-bold uppercase cursor-pointer hover:bg-zinc-800 dark:hover:bg-zinc-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
