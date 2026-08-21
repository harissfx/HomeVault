import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  UploadCloud,
  Download,
  Trash2,
  Settings,
  FileText,
  Image as ImageIcon,
  FileArchive,
  FileVideo,
  FileAudio,
  File as FileIcon,
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  FolderPlus,
  Layers,
  Sun,
  Moon,
} from 'lucide-react'
import {
  getConfig,
  saveConfig,
  checkHealth,
  listFiles,
  uploadFile,
  deleteFile,
  downloadFile,
  isImage,
  getFileBlobUrl,
  getStorageInfo,
  getAlbums,
  createAlbum,
  deleteAlbum,
} from './api'

const VIDEO_EXT = ['mp4', 'mov', 'avi', 'mkv', 'webm']
const DOC_EXT = ['txt', 'md', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']

const CATEGORIES = [
  { id: 'all', label: 'Semua' },
  { id: 'image', label: 'Foto' },
  { id: 'video', label: 'Video' },
  { id: 'document', label: 'Dokumen' },
  { id: 'other', label: 'Lainnya' },
]

function getCategory(name) {
  const ext = name.split('.').pop().toLowerCase()
  if (isImage(name)) return 'image'
  if (VIDEO_EXT.includes(ext)) return 'video'
  if (DOC_EXT.includes(ext)) return 'document'
  return 'other'
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

function iconFor(name) {
  const ext = name.split('.').pop().toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return ImageIcon
  if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) return FileArchive
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return FileVideo
  if (['mp3', 'wav', 'flac', 'ogg'].includes(ext)) return FileAudio
  if (['txt', 'md', 'pdf', 'doc', 'docx'].includes(ext)) return FileText
  return FileIcon
}

function cleanName(name) {
  return name.replace(/^\d+-/, '')
}

// Nama fisik di disk disanitasi jadi ASCII saja; kalau backend sudah nyimpen
// nama asli di metadata (originalName), pakai itu, kalau belum ada (file lama) fallback.
function displayName(f) {
  return f.originalName || cleanName(f.name)
}

// Nama file dari WhatsApp/IG dll bisa panjang banget (contoh:
// "728861550_18058473980725281_1661645548195098960_n.jpg"). Potong bagian
// tengahnya biar gak numpuk/overflow di modal atau tempat sempit lainnya.
function middleTruncate(name, max = 42) {
  if (name.length <= max) return name
  const extMatch = name.match(/\.[a-zA-Z0-9]{1,8}$/)
  const ext = extMatch ? extMatch[0] : ''
  const base = ext ? name.slice(0, -ext.length) : name
  const keep = Math.max(6, Math.floor((max - ext.length - 1) / 2))
  return `${base.slice(0, keep)}…${base.slice(-keep)}${ext}`
}

function storageBarColor(ratio) {
  if (ratio > 0.9) return 'bg-vault-danger'
  if (ratio > 0.7) return 'bg-vault-brass'
  return 'bg-vault-ok'
}

function dateLabel(iso) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a, b) => a.toDateString() === b.toDateString()
  if (sameDay(d, today)) return 'Hari ini'
  if (sameDay(d, yesterday)) return 'Kemarin'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

function groupByDate(list) {
  const groups = []
  let current = null
  for (const f of list) {
    const label = dateLabel(f.uploadedAt)
    if (!current || current.label !== label) {
      current = { label, items: [] }
      groups.push(current)
    }
    current.items.push(f)
  }
  return groups
}

export default function App() {
  const [config, setConfig] = useState(getConfig())
  const [showSettings, setShowSettings] = useState(false)
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('vault.theme')
      if (saved === 'light' || saved === 'dark') return saved
    } catch (e) {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem('vault.theme', theme)
    } catch (e) {}
  }, [theme])

  const [connection, setConnection] = useState('checking') // checking | ok | down
  const [files, setFiles] = useState([])
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [error, setError] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [uploads, setUploads] = useState([]) // { id, name, progress, status }
  const [pendingDelete, setPendingDelete] = useState(null)
  const [toast, setToast] = useState(null)
  const [thumbs, setThumbs] = useState({}) // { filename: blobUrl }
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [storageInfo, setStorageInfo] = useState(null)
  const [albums, setAlbums] = useState([])
  const [albumFilter, setAlbumFilter] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedNames, setSelectedNames] = useState(new Set())
  const [showCreateAlbum, setShowCreateAlbum] = useState(false)
  const fileInputRef = useRef(null)
  const thumbsRef = useRef({})

  // Ambil thumbnail buat file gambar yang belum punya blob URL, dan buang
  // blob URL milik file yang udah gak ada di list biar gak bocor memori.
  useEffect(() => {
    let cancelled = false
    const currentNames = new Set(files.map((f) => f.name))

    Object.entries(thumbsRef.current).forEach(([name, url]) => {
      if (!currentNames.has(name)) {
        URL.revokeObjectURL(url)
        delete thumbsRef.current[name]
      }
    })

    const toLoad = files.filter((f) => isImage(f.name) && !thumbsRef.current[f.name])
    toLoad.forEach(async (f) => {
      try {
        const url = await getFileBlobUrl(f.name)
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        thumbsRef.current[f.name] = url
        setThumbs({ ...thumbsRef.current })
      } catch (e) {
        // gagal ambil thumbnail, biarin fallback ke ikon generik
      }
    })

    return () => {
      cancelled = true
    }
  }, [files])

  const showToast = (msg, kind = 'ok') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3000)
  }

  const refresh = useCallback(async () => {
    try {
      await checkHealth()
      setConnection('ok')
    } catch {
      setConnection('down')
    }
    try {
      setLoadingFiles(true)
      const data = await listFiles()
      setFiles(data.files || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingFiles(false)
    }
    try {
      const info = await getStorageInfo()
      setStorageInfo(info)
    } catch (e) {
      // Backend lama mungkin belum punya endpoint /api/storage — biarin, gak fatal
      setStorageInfo(null)
    }
    try {
      const data = await getAlbums()
      setAlbums(data.albums || [])
    } catch (e) {
      // Backend lama mungkin belum punya endpoint /api/albums — biarin, gak fatal
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleFiles = async (fileList) => {
    const arr = Array.from(fileList)
    for (const file of arr) {
      const id = `${Date.now()}-${file.name}`
      setUploads((prev) => [...prev, { id, name: file.name, progress: 0, status: 'uploading' }])
      try {
        await uploadFile(file, (progress) => {
          setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, progress } : u)))
        })
        setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, status: 'done', progress: 100 } : u)))
        showToast(`${file.name} tersimpan`, 'ok')
        refresh()
      } catch (e) {
        setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, status: 'error' } : u)))
        showToast(`Gagal unggah ${file.name}`, 'error')
      }
      setTimeout(() => {
        setUploads((prev) => prev.filter((u) => u.id !== id))
      }, 2500)
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      await deleteFile(pendingDelete.name)
      showToast(`${displayName(pendingDelete)} dihapus`, 'ok')
      setFiles((prev) => prev.filter((f) => f.name !== pendingDelete.name))
    } catch (e) {
      showToast('Gagal menghapus file', 'error')
    }
    setPendingDelete(null)
  }

  const handleDownload = async (name) => {
    try {
      await downloadFile(name)
    } catch (e) {
      showToast('Gagal mengunduh file', 'error')
    }
  }

  const saveSettings = (next) => {
    saveConfig(next)
    setConfig(next)
    setShowSettings(false)
    refresh()
  }

  const toggleSelect = (name) => {
    setSelectedNames((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedNames(new Set())
  }

  const handleCreateAlbum = async (name) => {
    try {
      await createAlbum(name, Array.from(selectedNames))
      showToast(`Koleksi "${name}" dibuat`, 'ok')
      setShowCreateAlbum(false)
      exitSelectMode()
      refresh()
    } catch (e) {
      showToast('Gagal membuat koleksi', 'error')
    }
  }

  const handleDeleteAlbum = async (album) => {
    try {
      await deleteAlbum(album.id)
      if (albumFilter === album.id) setAlbumFilter(null)
      showToast(`Koleksi "${album.name}" dihapus`, 'ok')
      refresh()
    } catch (e) {
      showToast('Gagal menghapus koleksi', 'error')
    }
  }

  const activeAlbum = albums.find((a) => a.id === albumFilter) || null
  const visibleFiles = files
    .filter((f) => categoryFilter === 'all' || getCategory(f.name) === categoryFilter)
    .filter((f) => !activeAlbum || activeAlbum.fileNames.includes(f.name))
  const dateGroups = groupByDate(visibleFiles)

  return (
    <div className="min-h-screen bg-vault-bg font-body text-vault-text">
      {/* Header */}
      <header className="border-b border-vault-border">
        <div className="max-w-4xl mx-auto px-5 py-5 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-4xl font-extrabold tracking-tight uppercase leading-none text-vault-text">
              Vault
            </h1>
            <span className="font-mono text-xs text-vault-muted uppercase tracking-widest">Unit 02</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider">
              <span
                className={`h-2 w-2 rounded-full ${
                  connection === 'ok' ? 'bg-vault-ok' : connection === 'down' ? 'bg-vault-danger' : 'bg-vault-muted'
                }`}
              />
              <span className="text-vault-muted">
                {connection === 'ok' ? 'Tersambung' : connection === 'down' ? 'Terputus' : 'Memeriksa…'}
              </span>
            </div>
            <button
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              className="p-2 rounded-md border border-vault-border text-vault-muted hover:text-vault-brass hover:border-vault-brass transition-colors"
              aria-label="Ganti mode terang/gelap"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-md border border-vault-border text-vault-muted hover:text-vault-brass hover:border-vault-brass transition-colors"
              aria-label="Pengaturan koneksi"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-8">
        {connection === 'down' && (
          <div className="mb-6 border border-vault-danger/50 bg-vault-danger/10 rounded-md px-4 py-3 text-sm text-vault-text">
            Tidak bisa menyambung ke <span className="font-mono">{config.baseUrl}</span>. Cek server-nya jalan atau
            perbarui alamat di{' '}
            <button className="underline text-vault-brass" onClick={() => setShowSettings(true)}>
              pengaturan
            </button>
            .
          </div>
        )}

        {storageInfo && (
          <div className="mb-6 rounded-lg border border-vault-border bg-vault-surface px-4 py-3">
            <div className="flex items-baseline justify-between mb-2">
              <span className="font-mono text-xs uppercase tracking-wider text-vault-muted">Kapasitas Flashdisk</span>
              <span className="font-mono text-xs text-vault-muted">
                {storageInfo.totalBytes
                  ? `${formatBytes(storageInfo.freeBytes)} tersisa dari ${formatBytes(storageInfo.totalBytes)}`
                  : `${formatBytes(storageInfo.usedByFiles)} terpakai`}
              </span>
            </div>
            {storageInfo.totalBytes && (
              <div className="h-1.5 rounded-full bg-vault-border overflow-hidden">
                <div
                  className={`h-full ${storageBarColor(storageInfo.usedBytes / storageInfo.totalBytes)}`}
                  style={{ width: `${Math.min(100, (storageInfo.usedBytes / storageInfo.totalBytes) * 100)}%` }}
                />
              </div>
            )}
            <p className="mt-1.5 font-mono text-[11px] text-vault-muted">
              Vault ini pakai {formatBytes(storageInfo.usedByFiles)} dari isi flashdisk
            </p>
          </div>
        )}

        {/* Deposit slot */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative cursor-pointer rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragActive ? 'border-vault-brass bg-vault-brass/5' : 'border-vault-border bg-vault-surface'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files?.length && handleFiles(e.target.files)}
          />
          <UploadCloud className="mx-auto mb-3 text-vault-brass" size={30} strokeWidth={1.5} />
          <p className="font-display text-2xl uppercase tracking-wide text-vault-text">Slot Penyimpanan</p>
          <p className="mt-1 text-sm text-vault-muted">
            Jatuhkan file di sini, atau <span className="text-vault-brass">klik untuk pilih</span>
          </p>
        </div>

        {/* Active uploads */}
        {uploads.length > 0 && (
          <div className="mt-4 space-y-2">
            {uploads.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 rounded-md border border-vault-border bg-vault-surface px-4 py-2.5"
              >
                {u.status === 'uploading' && <Loader2 size={16} className="animate-spin text-vault-brass shrink-0" />}
                {u.status === 'done' && <CheckCircle2 size={16} className="text-vault-ok shrink-0" />}
                {u.status === 'error' && <XCircle size={16} className="text-vault-danger shrink-0" />}
                <span className="text-sm truncate flex-1">{u.name}</span>
                <span className="font-mono text-xs text-vault-muted w-10 text-right">
                  {u.status === 'uploading' ? `${u.progress}%` : u.status === 'done' ? 'OK' : '—'}
                </span>
                <div className="w-24 h-1 rounded-full bg-vault-border overflow-hidden shrink-0">
                  <div
                    className={`h-full transition-all ${u.status === 'error' ? 'bg-vault-danger' : 'bg-vault-brass'}`}
                    style={{ width: `${u.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Chip album, cuma muncul kalau udah pernah bikin koleksi */}
        {albums.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <button
              onClick={() => setAlbumFilter(null)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono uppercase tracking-wide border transition-colors ${
                albumFilter === null
                  ? 'bg-vault-brass text-vault-bg border-vault-brass'
                  : 'border-vault-border text-vault-muted hover:text-vault-text'
              }`}
            >
              <Layers size={12} /> Semua Koleksi
            </button>
            {albums.map((a) => (
              <div key={a.id} className="group relative">
                <button
                  onClick={() => setAlbumFilter(a.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono uppercase tracking-wide border transition-colors ${
                    albumFilter === a.id
                      ? 'bg-vault-brass text-vault-bg border-vault-brass'
                      : 'border-vault-border text-vault-muted hover:text-vault-text'
                  }`}
                >
                  {a.name} <span className="opacity-70">· {a.fileNames.length}</span>
                </button>
                <button
                  onClick={() => handleDeleteAlbum(a)}
                  className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center h-4 w-4 rounded-full bg-vault-danger text-white"
                  aria-label={`Hapus koleksi ${a.name}`}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Koleksi */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <h2 className="font-display text-lg uppercase tracking-widest text-vault-muted">
              {activeAlbum ? activeAlbum.name : 'Koleksi'}
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1 rounded-md border border-vault-border p-1">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategoryFilter(c.id)}
                    className={`px-3 py-1 rounded text-xs font-mono uppercase tracking-wide transition-colors ${
                      categoryFilter === c.id
                        ? 'bg-vault-brass text-vault-bg'
                        : 'text-vault-muted hover:text-vault-text'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wide border transition-colors ${
                  selectMode
                    ? 'bg-vault-brass text-vault-bg border-vault-brass'
                    : 'border-vault-border text-vault-muted hover:text-vault-text'
                }`}
              >
                <CheckSquare size={13} /> {selectMode ? 'Batal Pilih' : 'Pilih'}
              </button>
            </div>
            <span className="font-mono text-xs text-vault-muted">{visibleFiles.length} berkas</span>
          </div>

          {loadingFiles ? (
            <div className="py-16 text-center text-vault-muted text-sm font-mono">Memuat koleksi…</div>
          ) : error ? (
            <div className="py-16 text-center text-vault-danger text-sm">{error}</div>
          ) : visibleFiles.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-vault-border rounded-lg">
              <p className="text-vault-muted text-sm">
                {files.length === 0
                  ? 'Vault kosong. Jatuhkan file pertama di slot atas.'
                  : 'Gak ada berkas di kategori ini.'}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {dateGroups.map((group) => (
                <div key={group.label}>
                  <h3 className="font-mono text-xs uppercase tracking-wider text-vault-muted mb-2.5">
                    {group.label}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {group.items.map((f) => {
                      const Icon = iconFor(f.name)
                      const thumb = thumbs[f.name]
                      const idx = files.indexOf(f)
                      const selected = selectedNames.has(f.name)
                      return (
                        <div
                          key={f.name}
                          onClick={() =>
                            selectMode ? toggleSelect(f.name) : isImage(f.name) && setLightboxIndex(idx)
                          }
                          className={`group relative aspect-square rounded-lg border overflow-hidden cursor-pointer bg-vault-surface ${
                            selected ? 'border-vault-brass ring-2 ring-vault-brass' : 'border-vault-border'
                          }`}
                        >
                          {selectMode && (
                            <span
                              className={`absolute top-1.5 left-1.5 z-10 h-5 w-5 rounded flex items-center justify-center ${
                                selected ? 'bg-vault-brass text-vault-bg' : 'bg-black/50 text-white'
                              }`}
                            >
                              {selected ? <CheckSquare size={13} /> : <Square size={13} />}
                            </span>
                          )}

                          {thumb ? (
                            <img
                              src={thumb}
                              alt={displayName(f)}
                              className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-vault-surface2">
                              <Icon size={28} className="text-vault-brass" strokeWidth={1.5} />
                            </div>
                          )}

                          {/* Overlay info + aksi, muncul pas hover (disembunyikan pas mode pilih biar gak ganggu) */}
                          <div
                            className={`absolute inset-0 flex flex-col justify-between transition-opacity bg-gradient-to-t from-black/70 via-transparent to-transparent ${
                              selectMode ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            <div className="flex justify-end gap-1 p-1.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDownload(f.name)
                                }}
                                className="p-1.5 rounded-md bg-black/50 text-vault-text hover:text-vault-brass"
                                aria-label={`Unduh ${displayName(f)}`}
                              >
                                <Download size={14} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setPendingDelete(f)
                                }}
                                className="p-1.5 rounded-md bg-black/50 text-vault-text hover:text-vault-danger"
                                aria-label={`Hapus ${displayName(f)}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                            <div className="p-2">
                              <p className="text-xs text-white truncate">{displayName(f)}</p>
                              <p className="font-mono text-[10px] text-white/70">{formatBytes(f.sizeBytes)}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {toast && (
        <div
          className={`fixed bottom-5 right-5 rounded-md border px-4 py-3 text-sm font-body shadow-lg animate-stamp ${
            toast.kind === 'ok'
              ? 'border-vault-ok/50 bg-vault-surface text-vault-ok'
              : 'border-vault-danger/50 bg-vault-surface text-vault-danger'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {showSettings && (
        <SettingsModal config={config} onClose={() => setShowSettings(false)} onSave={saveSettings} />
      )}

      {pendingDelete && (
        <ConfirmModal
          name={displayName(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}

      {selectMode && selectedNames.size > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full border border-vault-border bg-vault-surface px-5 py-3 shadow-lg">
          <span className="font-mono text-xs text-vault-muted">{selectedNames.size} dipilih</span>
          <button
            onClick={() => setShowCreateAlbum(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono uppercase tracking-wide bg-vault-brass text-vault-bg hover:bg-vault-brassdim"
          >
            <FolderPlus size={13} /> Buat Koleksi
          </button>
          <button onClick={exitSelectMode} className="text-vault-muted hover:text-vault-text text-xs font-mono">
            Batal
          </button>
        </div>
      )}

      {showCreateAlbum && (
        <CreateAlbumModal
          count={selectedNames.size}
          onClose={() => setShowCreateAlbum(false)}
          onCreate={handleCreateAlbum}
        />
      )}

      {lightboxIndex !== null && files[lightboxIndex] && (
        <Lightbox
          files={files}
          index={lightboxIndex}
          thumbs={thumbs}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onDownload={handleDownload}
          onDelete={(f) => {
            setLightboxIndex(null)
            setPendingDelete(f)
          }}
        />
      )}
    </div>
  )
}

function Lightbox({ files, index, thumbs, onClose, onNavigate, onDownload, onDelete }) {
  const file = files[index]
  const imageFiles = files.map((f, i) => ({ ...f, i })).filter((f) => isImage(f.name))
  const posInImages = imageFiles.findIndex((f) => f.i === index)

  const goTo = (dir) => {
    if (imageFiles.length === 0) return
    const next = (posInImages + dir + imageFiles.length) % imageFiles.length
    onNavigate(imageFiles[next].i)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') goTo(1)
      if (e.key === 'ArrowLeft') goTo(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col" onClick={onClose}>
      <div className="shrink-0 flex items-center justify-between px-5 py-4" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <p className="text-sm truncate" title={displayName(file)}>
            {middleTruncate(displayName(file), 50)}
          </p>
          <p className="font-mono text-xs text-vault-muted">
            {formatBytes(file.sizeBytes)} · disimpan {formatDate(file.uploadedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onDownload(file.name)}
            className="p-2 rounded-md text-vault-muted hover:text-vault-brass"
            aria-label="Unduh"
          >
            <Download size={18} />
          </button>
          <button
            onClick={() => onDelete(file)}
            className="p-2 rounded-md text-vault-muted hover:text-vault-danger"
            aria-label="Hapus"
          >
            <Trash2 size={18} />
          </button>
          <button onClick={onClose} className="p-2 rounded-md text-vault-muted hover:text-vault-text" aria-label="Tutup">
            <X size={18} />
          </button>
        </div>
      </div>

      <div
        className="flex-1 min-h-0 flex items-center justify-center relative px-4 pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        {imageFiles.length > 1 && (
          <button
            onClick={() => goTo(-1)}
            className="absolute left-3 p-2 rounded-full bg-black/40 text-vault-text hover:text-vault-brass"
            aria-label="Sebelumnya"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        {thumbs[file.name] ? (
          <img
            src={thumbs[file.name]}
            alt={displayName(file)}
            className="max-h-full max-w-full w-auto h-auto object-contain rounded-md"
          />
        ) : (
          <Loader2 className="animate-spin text-vault-brass" size={28} />
        )}
        {imageFiles.length > 1 && (
          <button
            onClick={() => goTo(1)}
            className="absolute right-3 p-2 rounded-full bg-black/40 text-vault-text hover:text-vault-brass"
            aria-label="Berikutnya"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>
    </div>
  )
}

function SettingsModal({ config, onClose, onSave }) {
  const [baseUrl, setBaseUrl] = useState(config.baseUrl)
  const [apiKey, setApiKey] = useState(config.apiKey)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-50">
      <div className="w-full max-w-md rounded-lg border border-vault-border bg-vault-surface p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl uppercase tracking-wide">Sambungan Server</h3>
          <button onClick={onClose} className="text-vault-muted hover:text-vault-text">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block font-mono text-xs uppercase tracking-wider text-vault-muted mb-1.5">
              Alamat API
            </label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://xxxx.ngrok-free.app"
              className="w-full rounded-md border border-vault-border bg-vault-bg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-vault-brass"
            />
            <p className="mt-1 text-xs text-vault-muted">
              Ganti setiap kali link ngrok berubah setelah restart — tidak perlu deploy ulang.
            </p>
          </div>
          <div>
            <label className="block font-mono text-xs uppercase tracking-wider text-vault-muted mb-1.5">
              API Key
            </label>
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type="password"
              className="w-full rounded-md border border-vault-border bg-vault-bg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-vault-brass"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm text-vault-muted hover:text-vault-text"
          >
            Batal
          </button>
          <button
            onClick={() => onSave({ baseUrl, apiKey })}
            className="px-4 py-2 rounded-md text-sm bg-vault-brass text-vault-bg font-medium hover:bg-vault-brassdim"
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateAlbumModal({ count, onClose, onCreate }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    await onCreate(name.trim())
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-vault-border bg-vault-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-xl uppercase tracking-wide mb-1">Buat Koleksi</h3>
        <p className="text-sm text-vault-muted mb-4">
          {count} berkas terpilih bakal digabung jadi satu koleksi bernama.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Misalnya: Liburan Bali"
          className="w-full rounded-md border border-vault-border bg-vault-bg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-vault-brass"
        />
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-sm text-vault-muted hover:text-vault-text">
            Batal
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || saving}
            className="px-4 py-2 rounded-md text-sm bg-vault-brass text-vault-bg font-medium hover:bg-vault-brassdim disabled:opacity-50"
          >
            {saving ? 'Menyimpan…' : 'Buat'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({ name, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-50">
      <div className="w-full max-w-sm rounded-lg border border-vault-border bg-vault-surface p-6">
        <h3 className="font-display text-xl uppercase tracking-wide mb-2">Hapus Berkas?</h3>
        <p className="text-sm text-vault-muted mb-6">
          <span className="text-vault-text" title={name}>
            {middleTruncate(name)}
          </span>{' '}
          akan dihapus permanen dari vault. Tindakan ini tidak bisa dibatalkan.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-md text-sm text-vault-muted hover:text-vault-text">
            Batal
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-md text-sm bg-vault-danger text-white font-medium hover:opacity-90"
          >
            Hapus
          </button>
        </div>
      </div>
    </div>
  )
}