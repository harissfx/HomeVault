const DEFAULTS = {
  baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:4000',
  apiKey: import.meta.env.VITE_API_KEY || '',
}

const STORAGE_KEY = 'vault.config'

export function getConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch (e) {}
  return DEFAULTS
}

export function saveConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

async function request(path, options = {}) {
  const { baseUrl, apiKey } = getConfig()
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
  })
  if (!res.ok) {
    let msg = `Error ${res.status}`
    try {
      const body = await res.json()
      msg = body.error || body.message || msg
    } catch (e) {}
    throw new Error(msg)
  }
  return res
}

export async function getStorageInfo() {
  const res = await request('/api/storage')
  return res.json()
}

export async function getAlbums() {
  const res = await request('/api/albums')
  return res.json()
}

export async function createAlbum(name, fileNames) {
  const res = await request('/api/albums', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, fileNames }),
  })
  return res.json()
}

export async function deleteAlbum(id) {
  const res = await request(`/api/albums/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return res.json()
}

export async function checkHealth() {
  const { baseUrl } = getConfig()
  const res = await fetch(`${baseUrl}/api/health`)
  if (!res.ok) throw new Error('unhealthy')
  return res.json()
}

export async function listFiles() {
  const res = await request('/api/files')
  return res.json()
}

export async function uploadFile(file, onProgress) {
  const { baseUrl, apiKey } = getConfig()
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${baseUrl}/api/upload`)
    if (apiKey) xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText))
      } else {
        reject(new Error(`Upload gagal (${xhr.status})`))
      }
    }
    xhr.onerror = () => reject(new Error('Upload gagal — cek koneksi ke server'))
    const formData = new FormData()
    formData.append('file', file)
    xhr.send(formData)
  })
}

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif']

export function isImage(name) {
  const ext = name.split('.').pop().toLowerCase()
  return IMAGE_EXT.includes(ext)
}

export async function getFileBlobUrl(filename) {
  const res = await request(`/api/files/${encodeURIComponent(filename)}`)
  const blob = await res.blob()
  return window.URL.createObjectURL(blob)
}

export async function downloadFile(filename) {
  const res = await request(`/api/files/${encodeURIComponent(filename)}`)
  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.replace(/^\d+-/, '')
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

export async function deleteFile(filename) {
  const res = await request(`/api/files/${encodeURIComponent(filename)}`, { method: 'DELETE' })
  return res.json()
}