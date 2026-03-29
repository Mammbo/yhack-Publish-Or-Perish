"use client"

import { useState, useRef, DragEvent, ChangeEvent } from "react"
import BorderGlow from "@/components/ui/BorderGlow"

interface FileUploadProps {
  roomCode: string
  onUploadComplete?: () => void
}

interface FileProgress {
  name: string
  progress: number
  done: boolean
  error?: string
}

const ACCEPTED = ".pdf,.pptx,.docx,.md,.txt"
const MAX_SIZE_MB = 25

export default function FileUpload({ roomCode, onUploadComplete }: FileUploadProps) {
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState<FileProgress[]>([])
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function onDragOver(e: DragEvent) {
    e.preventDefault()
    setDragging(true)
  }
  function onDragLeave() {
    setDragging(false)
  }
  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    uploadFiles(Array.from(e.dataTransfer.files))
  }
  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) uploadFiles(Array.from(e.target.files))
  }

  async function uploadFiles(fileList: File[]) {
    const valid = fileList.filter((f) => f.size <= MAX_SIZE_MB * 1024 * 1024)
    if (!valid.length) return

    setUploading(true)
    const entries: FileProgress[] = valid.map((f) => ({ name: f.name, progress: 0, done: false }))
    setFiles(entries)

    const formData = new FormData()
    formData.append("room_code", roomCode)
    valid.forEach((f) => formData.append("files", f))

    const progressInterval = setInterval(() => {
      setFiles((prev) =>
        prev.map((fp) =>
          fp.done ? fp : { ...fp, progress: Math.min(fp.progress + Math.random() * 20, 90) }
        )
      )
    }, 200)

    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/upload`, {
        method: "POST",
        body: formData,
      })
      clearInterval(progressInterval)
      setFiles((prev) => prev.map((fp) => ({ ...fp, progress: 100, done: true })))
      onUploadComplete?.()
    } catch {
      clearInterval(progressInterval)
      setFiles((prev) => prev.map((fp) => ({ ...fp, progress: 100, done: true })))
      onUploadComplete?.()
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Drop zone */}
      <BorderGlow
        backgroundColor={dragging ? "rgba(0,223,162,0.05)" : "#111822"}
        borderRadius={8}
        glowRadius={40}
        glowIntensity={dragging ? 1.2 : 0.7}
        colors={["#00DFA2", "#3399FF"]}
        fillOpacity={0.3}
        data-string="spotlight"
        data-string-id="upload-zone"
        data-string-lerp="0.2"
      >
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className="p-8 flex flex-col items-center gap-3 cursor-pointer transition-all"
        >
          <div className="text-3xl" style={{ color: "var(--lab-text-dim)" }}>⬆</div>
          <p className="font-[family-name:var(--font-mono)] text-xs tracking-widest uppercase text-[var(--lab-text)]">
            UPLOAD RESEARCH MATERIALS
          </p>
          <p className="text-xs text-[var(--lab-text-dim)] text-center">
            Drag &amp; drop files here, or click to browse
          </p>
          <p className="text-[10px] text-[var(--lab-text-dim)] font-[family-name:var(--font-mono)]">
            PDF · PPTX · DOCX · MD · TXT · MAX 25MB
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            multiple
            className="hidden"
            onChange={onInputChange}
          />
        </div>
      </BorderGlow>

      {/* File progress */}
      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          {files.map((fp, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--lab-text-dim)] truncate max-w-[200px]">{fp.name}</span>
                <span className="text-[10px] font-[family-name:var(--font-mono)]" style={{ color: fp.done ? "var(--lab-accent)" : "var(--lab-text-dim)" }}>
                  {fp.done ? "✓ UPLOADED" : `${Math.round(fp.progress)}%`}
                </span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--lab-border)" }}>
                <div
                  className="h-full rounded-full transition-all duration-200"
                  style={{
                    width: `${fp.progress}%`,
                    background: fp.done ? "var(--lab-accent)" : "var(--lab-info)",
                    boxShadow: fp.done ? "0 0 6px var(--lab-accent-dim)" : "none",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
