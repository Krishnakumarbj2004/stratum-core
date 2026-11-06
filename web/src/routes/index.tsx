// src/routes/index.tsx
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import { useProject } from '../context/ProjectContext'
import {
  FileText,
  Users,
  Globe,
  Building2,
  Terminal,
  Play,
  Loader2,
  CheckCircle2,
  Database,
  Download,
  Square,
  TrendingUp,
  PieChart,
  ChevronDown,
  ChevronUp,
  Filter,
  HardDrive,
  RefreshCw,
  ArrowUpRight,
  AlertCircle,
  Clock,
  Sparkles,
} from 'lucide-react'

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

interface YearStat {
  year: number
  count: number
}

interface OAStatusStat {
  status: string
  count: number
}

interface DashboardStats {
  total_papers: number
  total_authors: number
  total_institutions: number
  total_countries: number
  papers_by_year: YearStat[] | null
  oa_status_counts: OAStatusStat[] | null
}

interface ProjectConfig {
  keywords?: string
  topics?: string
  start_date?: string
  end_date?: string
  doc_types?: string
}

interface ProjectFiles {
  project?: string
  jsonl_files?: Array<{
    name: string
    path: string
    size_human: string
    size_bytes: number
    is_imputed: boolean
  }>
  duckdb_files?: Array<{
    name: string
    path: string
    size_human: string
    size_bytes: number
  }>
  sqlite_files?: Array<{
    name: string
    path: string
    size_human: string
    size_bytes: number
  }>
  csv_folders?: Array<{
    name: string
    total_size_human: string
    files: Array<{ name: string; size_human: string }>
  }>
}

const OA_COLORS: Record<string, { bg: string; fill: string; text: string; label: string }> = {
  gold: { bg: 'bg-amber-500', fill: '#f59e0b', text: 'text-amber-500', label: 'Gold OA' },
  green: { bg: 'bg-emerald-500', fill: '#10b981', text: 'text-emerald-500', label: 'Green OA' },
  hybrid: { bg: 'bg-blue-500', fill: '#3b82f6', text: 'text-blue-500', label: 'Hybrid' },
  bronze: { bg: 'bg-orange-500', fill: '#f97316', text: 'text-orange-500', label: 'Bronze' },
  diamond: { bg: 'bg-purple-500', fill: '#a855f7', text: 'text-purple-500', label: 'Diamond' },
  closed: { bg: 'bg-zinc-500', fill: '#71717a', text: 'text-zinc-500', label: 'Closed Access' },
  unknown: { bg: 'bg-zinc-400', fill: '#a1a1aa', text: 'text-zinc-400', label: 'Unknown' },
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------

export function Index() {
  const { activeProject } = useProject()

  // State
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [config, setConfig] = useState<ProjectConfig | null>(null)
  const [files, setFiles] = useState<ProjectFiles | null>(null)
  const [loading, setLoading] = useState(true)

  // Pipeline Execution State
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<string[]>([])
  const [isLogsExpanded, setIsLogsExpanded] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Hover states for graphs
  const [hoveredYear, setHoveredYear] = useState<YearStat | null>(null)
  const [hoveredOA, setHoveredOA] = useState<OAStatusStat | null>(null)

  // Reset when active project switches
  const [prevProject, setPrevProject] = useState(activeProject)
  if (activeProject !== prevProject) {
    setPrevProject(activeProject)
    setStats(null)
    setConfig(null)
    setFiles(null)
    setSyncing(false)
    setProgress(0)
    setLogs([])
    setIsLogsExpanded(false)
    setActionError(null)
    setLoading(true)
  }

  const consoleBottomRef = useRef<HTMLDivElement | null>(null)

  // Fetch project data (Stats, Config, Export Files)
  const loadProjectData = useCallback(async () => {
    try {
      const [statsRes, configRes, filesRes] = await Promise.allSettled([
        fetch(`/api/stats?project=${encodeURIComponent(activeProject)}`),
        fetch(`/api/config?project=${encodeURIComponent(activeProject)}`),
        fetch(`/api/export/files?project=${encodeURIComponent(activeProject)}`),
      ])

      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        const statsData = await statsRes.value.json()
        setStats(statsData)
      }

      if (configRes.status === 'fulfilled' && configRes.value.ok) {
        const configData = await configRes.value.json()
        setConfig(configData)
      }

      if (filesRes.status === 'fulfilled' && filesRes.value.ok) {
        const filesData = await filesRes.value.json()
        setFiles(filesData)
      }
    } catch (err) {
      console.error('Failed to load project overview:', err)
    } finally {
      setLoading(false)
    }
  }, [activeProject])

  // Check initial pipeline status and load data
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProjectData()

    const checkInitialStatus = async () => {
      try {
        const response = await fetch(
          `/api/pipeline/status?project=${encodeURIComponent(activeProject)}`,
        )
        if (response.ok) {
          const data = await response.json()
          setSyncing(Boolean(data.syncing))
          setProgress(Number(data.progress) || 0)
          setLogs(data.logs || [])
          if (data.syncing) {
            setIsLogsExpanded(true)
          }
        }
      } catch (err) {
        console.error('Failed to check pipeline status:', err)
      }
    }

    checkInitialStatus()
  }, [activeProject, loadProjectData])

  // Poll Pipeline Status when Syncing
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null

    const checkStatus = async () => {
      try {
        const response = await fetch(
          `/api/pipeline/status?project=${encodeURIComponent(activeProject)}`,
        )
        if (response.ok) {
          const data = await response.json()
          setSyncing(Boolean(data.syncing))
          setProgress(Number(data.progress) || 0)
          setLogs(data.logs || [])

          if (!data.syncing) {
            if (intervalId) clearInterval(intervalId)
            // Reload stats and files upon pipeline completion
            loadProjectData()
          }
        }
      } catch (err) {
        console.error('Failed to poll status:', err)
      }
    }

    if (syncing) {
      intervalId = setInterval(checkStatus, 1000)
    } else {
      if (intervalId) clearInterval(intervalId)
    }

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [syncing, activeProject, loadProjectData])

  // Auto-scroll terminal logs
  useEffect(() => {
    if (isLogsExpanded && consoleBottomRef.current) {
      consoleBottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, isLogsExpanded])

  // Pipeline Execution Triggers
  const handleRunPipeline = async () => {
    if (syncing) return
    setActionError(null)
    setSyncing(true)
    setProgress(0)
    setIsLogsExpanded(true)
    setLogs([
      `[${new Date().toLocaleTimeString()}] [INFO] Starting full OpenAlex ingestion pipeline for project "${activeProject}"...`,
    ])

    try {
      const response = await fetch(
        `/api/run-pipeline?project=${encodeURIComponent(activeProject)}`,
        { method: 'POST' },
      )
      if (!response.ok) {
        const data = await response.json()
        const errMsg = data.error || 'Failed to start pipeline'
        setActionError(errMsg)
        setSyncing(false)
        setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] [ERROR] ${errMsg}`])
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setActionError(errMsg)
      setSyncing(false)
      setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] [ERROR] ${errMsg}`])
    }
  }

  const handleDownloadPapers = async () => {
    if (syncing) return
    setActionError(null)
    setSyncing(true)
    setProgress(0)
    setIsLogsExpanded(true)
    setLogs([
      `[${new Date().toLocaleTimeString()}] [INFO] Initiating raw papers download for project "${activeProject}"...`,
    ])

    try {
      const response = await fetch(
        `/api/download-papers?project=${encodeURIComponent(activeProject)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ output: 'collected_papers.jsonl' }),
        },
      )
      if (!response.ok) {
        const data = await response.json()
        const errMsg = data.error || 'Failed to start download'
        setActionError(errMsg)
        setSyncing(false)
        setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] [ERROR] ${errMsg}`])
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setActionError(errMsg)
      setSyncing(false)
      setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] [ERROR] ${errMsg}`])
    }
  }

  const handleCancelPipeline = async () => {
    try {
      await fetch(`/api/pipeline/cancel?project=${encodeURIComponent(activeProject)}`, {
        method: 'POST',
      })
      setLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] [WARN] Pipeline cancellation initiated by user.`,
      ])
    } catch (err) {
      console.error('Failed to cancel pipeline:', err)
    }
  }

  // Derived Metrics & Data
  const totalPapers = stats?.total_papers ?? 0
  const totalAuthors = stats?.total_authors ?? 0
  const totalInstitutions = stats?.total_institutions ?? 0
  const totalCountries = stats?.total_countries ?? 0

  // Open Access calculations
  const { totalOA, oaPercentage, oaItems } = useMemo(() => {
    if (!stats?.oa_status_counts || stats.oa_status_counts.length === 0) {
      return { totalOA: 0, oaPercentage: 0, oaItems: [] }
    }
    const counts = stats.oa_status_counts
    let oaSum = 0
    let totalAll = 0
    counts.forEach((item) => {
      totalAll += item.count
      if (item.status !== 'closed' && item.status !== 'unknown') {
        oaSum += item.count
      }
    })
    const pct = totalAll > 0 ? Math.round((oaSum / totalAll) * 100) : 0
    return { totalOA: oaSum, oaPercentage: pct, oaItems: counts }
  }, [stats])

  // Publications by year data
  const yearlyData = useMemo(() => {
    if (!stats?.papers_by_year || stats.papers_by_year.length === 0) return []
    return [...stats.papers_by_year].sort((a, b) => a.year - b.year)
  }, [stats])

  const maxYearlyCount = useMemo(() => {
    if (yearlyData.length === 0) return 1
    return Math.max(...yearlyData.map((d) => d.count), 1)
  }, [yearlyData])

  const peakYearItem = useMemo(() => {
    if (yearlyData.length === 0) return null
    return yearlyData.reduce((prev, curr) => (curr.count > prev.count ? curr : prev), yearlyData[0])
  }, [yearlyData])

  // Pipeline Stepper Progress Statuses
  const hasScopeConfig = Boolean(config?.keywords?.trim() || config?.topics?.trim())
  const rawJsonlFile = files?.jsonl_files?.find((f) => !f.is_imputed)
  const hasRawJsonl = Boolean(rawJsonlFile)
  const imputedJsonlFile = files?.jsonl_files?.find((f) => f.is_imputed)
  const hasImputedJsonl = Boolean(imputedJsonlFile)
  const hasDatabase = Boolean(
    (files?.duckdb_files && files.duckdb_files.length > 0) || totalPapers > 0,
  )

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-12 font-sans">
      {/* ------------------------------------------------------------- */}
      {/* Header: Project Mission Control & Quick Health               */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-mono font-bold tracking-tight text-zinc-900 dark:text-zinc-50 uppercase">
              Mission Control
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border bg-zinc-100 text-zinc-800 border-zinc-200 dark:bg-zinc-850 dark:text-zinc-300 dark:border-zinc-700">
              <span
                className={`h-2 w-2 rounded-full ${
                  totalPapers > 0 ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              {activeProject}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Pipeline orchestration, analytical telemetry, and data distribution for the active
            research workspace.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => loadProjectData()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-850 transition shadow-sm cursor-pointer"
            title="Refresh statistics"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <Link
            to="/ingest"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-850 transition shadow-sm"
          >
            <Filter className="h-3.5 w-3.5" />
            <span>Ingest Config</span>
          </Link>
          <Link
            to="/sql"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-850 transition shadow-sm"
          >
            <Database className="h-3.5 w-3.5" />
            <span>SQL Playground</span>
          </Link>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Entity Metrics Grid                                           */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Papers */}
        <div className="p-4 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 rounded-lg flex flex-col gap-1.5 shadow-xs">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider">
              Total Publications
            </span>
            <FileText className="h-4 w-4" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {totalPapers.toLocaleString()}
            </span>
          </div>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {totalPapers > 0 ? 'Indexed analytical records' : 'No records yet'}
          </span>
        </div>

        {/* Total Authors */}
        <div className="p-4 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 rounded-lg flex flex-col gap-1.5 shadow-xs">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider">
              Unique Authors
            </span>
            <Users className="h-4 w-4" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {totalAuthors.toLocaleString()}
            </span>
          </div>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {totalAuthors > 0 ? 'Researchers attributed' : 'Pending ingestion'}
          </span>
        </div>

        {/* Total Institutions */}
        <div className="p-4 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 rounded-lg flex flex-col gap-1.5 shadow-xs">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider">
              Institutions
            </span>
            <Building2 className="h-4 w-4" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {totalInstitutions.toLocaleString()}
            </span>
          </div>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {totalInstitutions > 0 ? 'Resolved organizations' : 'Pending resolution'}
          </span>
        </div>

        {/* Countries & Open Access */}
        <div className="p-4 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 rounded-lg flex flex-col gap-1.5 shadow-xs">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider">
              Countries & OA
            </span>
            <Globe className="h-4 w-4" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {totalCountries} <span className="text-sm font-normal text-zinc-400">countries</span>
            </span>
            {totalPapers > 0 && (
              <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {oaPercentage}% OA
              </span>
            )}
          </div>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {totalOA.toLocaleString()} Open Access papers
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 1: Pipeline Execution Control Center                 */}
      {/* ------------------------------------------------------------- */}
      <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 rounded-lg overflow-hidden shadow-xs">
        {/* Pipeline Control Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-zinc-50/50 dark:bg-zinc-900/80">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 flex items-center justify-center shrink-0">
              {syncing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Play className="h-4 w-4 fill-current ml-0.5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-mono font-bold uppercase tracking-tight text-zinc-900 dark:text-zinc-100">
                  Pipeline Execution Engine
                </h2>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                    syncing
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                      : totalPapers > 0
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                        : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700'
                  }`}
                >
                  {syncing
                    ? `Running: ${progress}%`
                    : totalPapers > 0
                      ? 'Pipeline Ready'
                      : 'Idle (Pending Run)'}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Execute asynchronous data collection, ROR affiliation imputations, and DuckDB analytical compilation.
              </p>
            </div>
          </div>

          {/* Action Button Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {syncing ? (
              <button
                onClick={handleCancelPipeline}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-md font-mono text-xs font-semibold select-none border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/60 cursor-pointer transition shadow-xs"
                title="Cancel running pipeline"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>Stop Pipeline</span>
              </button>
            ) : (
              <button
                onClick={handleDownloadPapers}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-md font-mono text-xs font-medium select-none border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-850 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer shadow-xs transition"
                title="Download publication works to raw JSONL only"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Papers</span>
              </button>
            )}

            <button
              onClick={handleRunPipeline}
              disabled={syncing}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-mono text-xs font-semibold select-none border transition shadow-xs ${
                syncing
                  ? 'bg-zinc-200 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-400 cursor-not-allowed'
                  : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 border-zinc-900 dark:border-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 cursor-pointer'
              }`}
            >
              {syncing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Syncing... {progress}%</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Run OpenAlex Sync</span>
                </>
              )}
            </button>

            <button
              onClick={() => setIsLogsExpanded(!isLogsExpanded)}
              className="flex items-center gap-1 px-2.5 py-2 rounded-md font-mono text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              title={isLogsExpanded ? 'Hide Diagnostics Log' : 'Show Diagnostics Log'}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>{isLogsExpanded ? 'Hide Logs' : 'View Logs'}</span>
              {isLogsExpanded ? (
                <ChevronUp className="h-3.5 w-3.5 ml-0.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 ml-0.5" />
              )}
            </button>
          </div>
        </div>

        {/* Action Error Banner */}
        {actionError && (
          <div className="bg-rose-50 dark:bg-rose-950/30 border-b border-rose-200 dark:border-rose-900/50 p-3 px-4 flex items-center gap-2 text-xs font-mono text-rose-700 dark:text-rose-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{actionError}</span>
            <button
              onClick={() => setActionError(null)}
              className="text-rose-500 hover:text-rose-800 dark:hover:text-rose-200 underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Progress Bar (Visible when syncing or progress > 0) */}
        {(syncing || progress > 0) && (
          <div className="w-full bg-zinc-100 dark:bg-zinc-850 h-2 border-b border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div
              className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-300 ease-out"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        )}

        {/* Pipeline Lifecycle Stages Stepper */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200 dark:divide-zinc-800 border-b border-zinc-200 dark:border-zinc-800 text-xs font-mono">
          {/* Stage 1: Query & Scope */}
          <div className="p-3.5 flex items-start gap-3 bg-zinc-50/30 dark:bg-zinc-900/20">
            <div
              className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold ${
                hasScopeConfig
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                  : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
              }`}
            >
              {hasScopeConfig ? <CheckCircle2 className="h-4 w-4" /> : '1'}
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-bold text-zinc-900 dark:text-zinc-100">1. Query & Scope</span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                {hasScopeConfig ? 'Keywords / Topics configured' : 'Scope not configured'}
              </span>
            </div>
          </div>

          {/* Stage 2: Raw Ingestion */}
          <div className="p-3.5 flex items-start gap-3 bg-zinc-50/30 dark:bg-zinc-900/20">
            <div
              className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold ${
                hasRawJsonl
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                  : syncing
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                    : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
              }`}
            >
              {hasRawJsonl ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                '2'
              )}
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-bold text-zinc-900 dark:text-zinc-100">2. Raw JSONL</span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                {hasRawJsonl ? `${rawJsonlFile?.size_human} collected` : 'Pending download'}
              </span>
            </div>
          </div>

          {/* Stage 3: Affiliation Imputation */}
          <div className="p-3.5 flex items-start gap-3 bg-zinc-50/30 dark:bg-zinc-900/20">
            <div
              className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold ${
                hasImputedJsonl
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                  : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
              }`}
            >
              {hasImputedJsonl ? <CheckCircle2 className="h-4 w-4" /> : '3'}
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-bold text-zinc-900 dark:text-zinc-100">3. Imputed Affiliations</span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                {hasImputedJsonl ? `${imputedJsonlFile?.size_human} resolved` : 'Pending imputation'}
              </span>
            </div>
          </div>

          {/* Stage 4: Relational & Analytical DB */}
          <div className="p-3.5 flex items-start gap-3 bg-zinc-50/30 dark:bg-zinc-900/20">
            <div
              className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold ${
                hasDatabase
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                  : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
              }`}
            >
              {hasDatabase ? <CheckCircle2 className="h-4 w-4" /> : '4'}
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-bold text-zinc-900 dark:text-zinc-100">4. DuckDB Analytics</span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                {hasDatabase ? `${totalPapers.toLocaleString()} rows ready` : 'Pending compilation'}
              </span>
            </div>
          </div>
        </div>

        {/* Collapsible Live Diagnostics Terminal Console */}
        {isLogsExpanded && (
          <div className="bg-zinc-950 text-zinc-300 font-mono text-[11px] leading-relaxed select-text">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/80 bg-zinc-900/60 text-zinc-400 text-xs">
              <div className="flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                <span className="font-bold text-zinc-200">Execution Diagnostics Console</span>
                <span className="text-[10px] text-zinc-500">
                  ({logs.length} lines)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setLogs([])}
                  className="text-zinc-500 hover:text-zinc-300 transition cursor-pointer text-[10px]"
                >
                  Clear Console
                </button>
              </div>
            </div>

            <div className="p-4 h-56 overflow-y-auto flex flex-col gap-1">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-600 select-none py-8">
                  <span>Diagnostics console idle. Click "Run OpenAlex Sync" to start ingestion.</span>
                </div>
              ) : (
                <>
                  {logs.map((log, index) => (
                    <div
                      key={index}
                      className={
                        log.includes('[SUCCESS]')
                          ? 'text-emerald-400'
                          : log.includes('[ERROR]')
                            ? 'text-rose-400 font-semibold'
                            : log.includes('[WARN]')
                              ? 'text-amber-400'
                              : 'text-zinc-300'
                      }
                    >
                      {log}
                    </div>
                  ))}
                  {progress >= 100 && (
                    <div className="text-emerald-400 font-bold flex items-center gap-1.5 mt-1 pt-1 border-t border-zinc-800">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>[SUCCESS] Pipeline completed successfully. DuckDB dataset compiled.</span>
                    </div>
                  )}
                  <div ref={consoleBottomRef} />
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 2: The 2 High-Value Visual Graphs                      */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GRAPH 1: Publications Over Time / Trajectory */}
        <div className="p-5 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 rounded-lg flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                <h3 className="text-sm font-mono font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">
                  Publication Trajectory
                </h3>
              </div>
              {peakYearItem && peakYearItem.count > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700">
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  Peak: {peakYearItem.year} ({peakYearItem.count.toLocaleString()} papers)
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
              Annual volume distribution of publications over time.
            </p>
          </div>

          {/* SVG Annual Trend Chart */}
          {yearlyData.length > 0 ? (
            <div className="flex flex-col gap-2">
              {/* Interactive Tooltip Banner */}
              <div className="h-6 flex items-center justify-between text-xs font-mono px-2 py-1 bg-zinc-50 dark:bg-zinc-850 rounded border border-zinc-200 dark:border-zinc-800">
                {hoveredYear ? (
                  <>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      Year {hoveredYear.year}:
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      {hoveredYear.count.toLocaleString()} publications (
                      {totalPapers > 0
                        ? `${Math.round((hoveredYear.count / totalPapers) * 100)}%`
                        : '0%'}
                      )
                    </span>
                  </>
                ) : (
                  <span className="text-zinc-400 text-[11px]">
                    Hover over any year bar to view details
                  </span>
                )}
              </div>

              {/* Chart SVG */}
              <div className="w-full h-48 relative select-none">
                <svg
                  viewBox="0 0 500 180"
                  className="w-full h-full overflow-visible"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="#059669" stopOpacity="0.4" />
                    </linearGradient>
                    <linearGradient id="barHoverGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity="1" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Gridlines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                    const y = 140 - pct * 120
                    const val = Math.round(pct * maxYearlyCount)
                    return (
                      <g key={i}>
                        <line
                          x1="35"
                          y1={y}
                          x2="495"
                          y2={y}
                          stroke="currentColor"
                          className="text-zinc-200 dark:text-zinc-800"
                          strokeDasharray={pct === 0 ? '' : '3 3'}
                          strokeWidth="1"
                        />
                        <text
                          x="30"
                          y={y + 3}
                          textAnchor="end"
                          className="text-[9px] font-mono fill-zinc-400"
                        >
                          {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                        </text>
                      </g>
                    )
                  })}

                  {/* Render Bars */}
                  {yearlyData.map((d, i) => {
                    const chartLeft = 40
                    const chartWidth = 455
                    const slotWidth = chartWidth / yearlyData.length
                    const barWidth = Math.max(3, Math.min(22, slotWidth * 0.72))
                    const x = chartLeft + i * slotWidth + (slotWidth - barWidth) / 2
                    const barHeight = Math.max(2, (d.count / maxYearlyCount) * 120)
                    const y = 140 - barHeight
                    const isHovered = hoveredYear?.year === d.year

                    // Label visibility decimation if many years
                    const showLabel =
                      yearlyData.length <= 12 ||
                      i === 0 ||
                      i === yearlyData.length - 1 ||
                      (yearlyData.length <= 24 ? i % 3 === 0 : i % 5 === 0)

                    return (
                      <g
                        key={d.year}
                        className="cursor-pointer transition-all"
                        onMouseEnter={() => setHoveredYear(d)}
                        onMouseLeave={() => setHoveredYear(null)}
                      >
                        {/* Invisible Wider Hitbox */}
                        <rect
                          x={chartLeft + i * slotWidth}
                          y="10"
                          width={slotWidth}
                          height="140"
                          fill="transparent"
                        />
                        {/* Visible Bar */}
                        <rect
                          x={x}
                          y={y}
                          width={barWidth}
                          height={barHeight}
                          rx="2"
                          fill={isHovered ? 'url(#barHoverGradient)' : 'url(#barGradient)'}
                          className="transition-colors duration-150"
                        />
                        {/* X-axis Year Label */}
                        {showLabel && (
                          <text
                            x={x + barWidth / 2}
                            y="158"
                            textAnchor="middle"
                            className={`text-[9px] font-mono ${
                              isHovered
                                ? 'fill-emerald-500 font-bold'
                                : 'fill-zinc-400 dark:fill-zinc-500'
                            }`}
                          >
                            {d.year}
                          </text>
                        )}
                      </g>
                    )
                  })}
                </svg>
              </div>

              {/* Chart Footer Stats */}
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 dark:text-zinc-400 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <span>
                  Timespan: {yearlyData[0].year} – {yearlyData[yearlyData.length - 1].year} (
                  {yearlyData.length} years)
                </span>
                <span>
                  Avg:{' '}
                  {Math.round(totalPapers / yearlyData.length).toLocaleString()}{' '}
                  papers/yr
                </span>
              </div>
            </div>
          ) : (
            <div className="h-48 border border-dashed border-zinc-200 dark:border-zinc-800 rounded flex flex-col items-center justify-center text-center p-6 text-zinc-400">
              <TrendingUp className="h-8 w-8 mb-2 opacity-40" />
              <span className="text-xs font-mono font-bold text-zinc-600 dark:text-zinc-400">
                No publication records yet
              </span>
              <p className="text-[11px] text-zinc-400 mt-1 max-w-xs">
                Run the pipeline above to download works and view the annual research trajectory.
              </p>
            </div>
          )}
        </div>

        {/* GRAPH 2: Open Access Breakdown */}
        <div className="p-5 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 rounded-lg flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <PieChart className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                <h3 className="text-sm font-mono font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">
                  Open Access Distribution
                </h3>
              </div>
              {totalPapers > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  {oaPercentage}% Open Access
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
              Accessibility categorization across Gold, Hybrid, Green, Bronze, and Closed repositories.
            </p>
          </div>

          {/* Donut and Legend */}
          {oaItems.length > 0 && totalPapers > 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* SVG Donut */}
              <div className="relative w-40 h-40 shrink-0">
                <svg viewBox="0 0 160 160" className="w-full h-full transform -rotate-90">
                  {(() => {
                    const totalAll = oaItems.reduce((acc, curr) => acc + curr.count, 0)
                    const radius = 56
                    const circumference = 2 * Math.PI * radius
                    let accumulatedOffset = 0

                    return oaItems.map((item) => {
                      const ratio = totalAll > 0 ? item.count / totalAll : 0
                      const strokeDasharray = `${ratio * circumference} ${circumference}`
                      const strokeDashoffset = -accumulatedOffset
                      accumulatedOffset += ratio * circumference
                      const colorInfo = OA_COLORS[item.status.toLowerCase()] || OA_COLORS.unknown
                      const isHovered = hoveredOA?.status === item.status

                      return (
                        <circle
                          key={item.status}
                          cx="80"
                          cy="80"
                          r={radius}
                          fill="transparent"
                          stroke={colorInfo.fill}
                          strokeWidth={isHovered ? 26 : 22}
                          strokeDasharray={strokeDasharray}
                          strokeDashoffset={strokeDashoffset}
                          className="transition-all duration-200 cursor-pointer"
                          onMouseEnter={() => setHoveredOA(item)}
                          onMouseLeave={() => setHoveredOA(null)}
                        />
                      )
                    })
                  })()}
                </svg>

                {/* Donut Center Label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  {hoveredOA ? (
                    <>
                      <span className="text-base font-mono font-bold text-zinc-900 dark:text-zinc-100">
                        {hoveredOA.count.toLocaleString()}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500 uppercase">
                        {hoveredOA.status}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-xl font-mono font-bold text-zinc-900 dark:text-zinc-100">
                        {oaPercentage}%
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500 uppercase">
                        Open Access
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Categorization Legend Matrix */}
              <div className="flex-1 w-full flex flex-col gap-1.5 text-xs font-mono">
                {oaItems.map((item) => {
                  const colorInfo = OA_COLORS[item.status.toLowerCase()] || OA_COLORS.unknown
                  const totalAll = oaItems.reduce((acc, curr) => acc + curr.count, 0)
                  const pct = totalAll > 0 ? ((item.count / totalAll) * 100).toFixed(1) : '0'
                  const isHovered = hoveredOA?.status === item.status

                  return (
                    <div
                      key={item.status}
                      onMouseEnter={() => setHoveredOA(item)}
                      onMouseLeave={() => setHoveredOA(null)}
                      className={`flex items-center justify-between p-1.5 rounded transition cursor-pointer ${
                        isHovered
                          ? 'bg-zinc-100 dark:bg-zinc-800'
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-850/60'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${colorInfo.bg}`} />
                        <span className="capitalize text-zinc-700 dark:text-zinc-300">
                          {colorInfo.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-zinc-900 dark:text-zinc-100">
                          {item.count.toLocaleString()}
                        </span>
                        <span className="text-[11px] text-zinc-400 w-12 text-right">
                          {pct}%
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="h-48 border border-dashed border-zinc-200 dark:border-zinc-800 rounded flex flex-col items-center justify-center text-center p-6 text-zinc-400">
              <PieChart className="h-8 w-8 mb-2 opacity-40" />
              <span className="text-xs font-mono font-bold text-zinc-600 dark:text-zinc-400">
                No Open Access metrics yet
              </span>
              <p className="text-[11px] text-zinc-400 mt-1 max-w-xs">
                Ingest publication works into the analytical database to calculate accessibility shares.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 3: Active Scope & Storage Snapshots                   */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Research Query & Scope Card */}
        <div className="p-5 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 rounded-lg flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                <h3 className="text-sm font-mono font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">
                  Active Research Scope
                </h3>
              </div>
              <Link
                to="/ingest"
                className="text-xs font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-1"
              >
                <span>Edit Scope</span>
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
              Boolean keyword logic, OpenAlex topic IDs, and date boundaries for {activeProject}.
            </p>

            <div className="flex flex-col gap-3 font-mono text-xs">
              {/* Keywords Logic Preview */}
              <div className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">
                  Boolean Query Filter
                </span>
                <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-800 dark:text-zinc-200 max-h-24 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text">
                  {config?.keywords?.trim() || 'No keywords defined for this project.'}
                </div>
              </div>

              {/* Scope Parameters: Dates & Topics */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-2.5 rounded bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase text-zinc-400 font-bold">Date Range</span>
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    {config?.start_date && config?.end_date
                      ? `${config.start_date} – ${config.end_date}`
                      : 'All available dates'}
                  </span>
                </div>

                <div className="p-2.5 rounded bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase text-zinc-400 font-bold">Topic Filters</span>
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                    {config?.topics?.trim()
                      ? `${config.topics.split('\n').filter(Boolean).length} topics targeted`
                      : 'None specified'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Project Storage & Artifacts Footprint */}
        <div className="p-5 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 rounded-lg flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                <h3 className="text-sm font-mono font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">
                  Data Footprint & Artifacts
                </h3>
              </div>
              <Link
                to="/export"
                className="text-xs font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-1"
              >
                <span>Export Hub</span>
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
              Physical storage footprint across JSONL streams, DuckDB engines, and CSV bundles.
            </p>

            <div className="flex flex-col gap-2 font-mono text-xs">
              {/* Raw & Imputed JSONL */}
              <div className="flex items-center justify-between p-2.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-zinc-400" />
                  <div>
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">
                      OpenAlex Works Streams
                    </span>
                    <span className="block text-[10px] text-zinc-400">
                      {files?.jsonl_files?.length ?? 0} JSONL files recorded
                    </span>
                  </div>
                </div>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  {rawJsonlFile ? rawJsonlFile.size_human : '0 B'}
                </span>
              </div>

              {/* DuckDB Analytical DB */}
              <div className="flex items-center justify-between p-2.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-emerald-500" />
                  <div>
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">
                      DuckDB Analytical Engine
                    </span>
                    <span className="block text-[10px] text-zinc-400">
                      {files?.duckdb_files?.[0]?.name || `${activeProject}.duckdb`}
                    </span>
                  </div>
                </div>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  {files?.duckdb_files?.[0]?.size_human || '0 B'}
                </span>
              </div>

              {/* Relational CSV Tables */}
              <div className="flex items-center justify-between p-2.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-zinc-400" />
                  <div>
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">
                      Relational CSV Decompositions
                    </span>
                    <span className="block text-[10px] text-zinc-400">
                      {files?.csv_folders?.[0]?.files?.length ?? 0} tables generated
                    </span>
                  </div>
                </div>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  {files?.csv_folders?.[0]?.total_size_human || '0 B'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
