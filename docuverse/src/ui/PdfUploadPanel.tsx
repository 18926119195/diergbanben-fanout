import { useRef, useState } from 'react'
import { isPublicDemo } from '../demoMode'
import { importPdfFile } from '../data/pdfImport'
import {
  loadDualModelConfig,
  saveDualModelConfig,
} from '../reasoning/modelRuntimeConfig'
import { useIndexGate } from '../reasoning/indexGate'
import { useDocuverse } from '../canvas/store'

export function PdfUploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null)
  const applyUploadedUniverse = useDocuverse((s) => s.applyUploadedUniverse)
  const clearWorkspaceAnnotations = useDocuverse(
    (s) => s.clearWorkspaceAnnotations,
  )
  const setUploadProgress = useDocuverse((s) => s.setUploadProgress)
  const uploadProgress = useDocuverse((s) => s.uploadProgress)
  const corpus = useDocuverse((s) => s.corpus)
  const uploadLabel = useDocuverse((s) => s.uploadLabel)
  const runOcrOnPagesLackingText = useDocuverse(
    (s) => s.runOcrOnPagesLackingText,
  )
  const setImporting = useIndexGate((s) => s.setImporting)
  const finalizeIndex = useIndexGate((s) => s.finalizeIndex)
  const setIndexError = useIndexGate((s) => s.setError)
  const resetIndex = useIndexGate((s) => s.reset)
  const indexPhase = useIndexGate((s) => s.phase)
  const indexMessage = useIndexGate((s) => s.message)
  const indexReady = useIndexGate((s) => s.ready)

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pdfHasTextLayer, setPdfHasTextLayer] = useState(
    () => loadDualModelConfig().pdfHasTextLayer,
  )

  const persistTextLayerFlag = (hasText: boolean) => {
    setPdfHasTextLayer(hasText)
    const cfg = loadDualModelConfig()
    saveDualModelConfig({ ...cfg, pdfHasTextLayer: hasText })
  }

  const onPick = async (file: File | undefined) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('请选择 PDF 文件')
      return
    }
    setError(null)
    setBusy(true)
    resetIndex()
    setImporting('正在打开 PDF…')
    try {
      const result = await importPdfFile(file, (p) => {
        setUploadProgress({
          current: p.current,
          total: p.total,
          message: p.message,
        })
      })
      applyUploadedUniverse(result)
      setUploadProgress(null)

      const cfg = loadDualModelConfig()
      const docId = `upload:${result.label}`
      // 用户声明有文字层 → 跳过 OCR；声明无文字层且开启自动 OCR → 强制 OCR
      const shouldOcr =
        cfg.autoOcrOnUpload !== false && !pdfHasTextLayer
      if (shouldOcr) {
        useIndexGate.setState({
          phase: 'ocr',
          message: '正在识别扫描页…',
          ready: false,
        })
        setUploadProgress({
          current: 0,
          total: 1,
          message: '正在识别扫描页…',
        })
        const pageCount = useDocuverse.getState().pages.length
        const { done, failed } = await runOcrOnPagesLackingText({
          maxPages: Math.max(pageCount, 1),
          deferIndexSync: true,
          // 用户已声明无可用文字层：即使 pdf.js 抽出字也不跳过
          forceEvenIfPdfText: true,
          onProgress: (d, t) => {
            setUploadProgress({
              current: d,
              total: t,
              message: `处理中 ${d}/${t} 页`,
            })
            useIndexGate.setState({
              phase: 'ocr',
              message: `处理中 ${d}/${t} 页`,
            })
          },
        })
        setUploadProgress(null)
        if (failed > 0) {
          setError(
            `部分页面未能识别（${failed}/${done + failed}）· 将使用已有结果继续`,
          )
        }
      }

      setUploadProgress({
        current: 0,
        total: 1,
        message: '正在整理文献…',
      })
      const { pages, ocrByStrand } = useDocuverse.getState()
      await finalizeIndex({ docId, pages, ocrByStrand })
      setUploadProgress(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '导入失败'
      setError(msg)
      setIndexError(msg)
      setUploadProgress(null)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <section className="hud-panel upload">
      <h2>上传 PDF</h2>
      {isPublicDemo ? (
        <p className="meta">上传后可在右侧输入问题并对照出处</p>
      ) : (
        <p className="meta">
          流水线：导入 →
          {pdfHasTextLayer ? ' PDF 文字层' : ' OCR（扫描）'} → Embedding →
          就绪后才可 V_q 提问
        </p>
      )}
      <label className="meta" style={{ display: 'block', marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={pdfHasTextLayer}
          disabled={busy}
          onChange={(e) => persistTextLayerFlag(e.target.checked)}
        />{' '}
        PDF 有可用文字层（勾选则跳过 OCR，直接用 PDF 文字）
      </label>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => void onPick(e.target.files?.[0])}
      />
      <button
        type="button"
        className="upload-btn"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? '处理中…' : '选择 PDF 文件'}
      </button>
      <button
        type="button"
        className="corpus-chip"
        disabled={busy}
        title="清除标注；页面保留"
        onClick={() => {
          if (
            !window.confirm(
              '清除全部强调 / 连线标注？页面会保留，可继续导入。',
            )
          ) {
            return
          }
          clearWorkspaceAnnotations()
          resetIndex()
        }}
      >
        清空标注
      </button>
      {(busy || indexPhase === 'ocr' || indexPhase === 'embedding') && (
        <p className="meta">{indexMessage}</p>
      )}
      {indexReady && (
        <p className="meta" style={{ color: '#5cffb1' }}>
          ✓ {indexMessage}
        </p>
      )}
      {uploadProgress && (
        <div className="upload-progress">
          <div className="bar">
            <span
              style={{
                width:
                  uploadProgress.total > 0
                    ? `${Math.min(100, (100 * uploadProgress.current) / uploadProgress.total)}%`
                    : '30%',
              }}
            />
          </div>
          <p className="meta">{uploadProgress.message}</p>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {corpus === 'upload' && uploadLabel && (
        <p className="meta">当前：{uploadLabel}</p>
      )}
    </section>
  )
}
