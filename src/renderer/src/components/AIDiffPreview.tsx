import type { AiProposedEdit } from '@shared/ai-types'

interface AIDiffPreviewProps {
  edit: AiProposedEdit
  onAccept: () => void
  onReject: () => void
}

const KIND_LABEL: Record<AiProposedEdit['kind'], string> = {
  replace_selection: '替换选中内容',
  insert_at_cursor: '在光标处插入',
  replace_range: '替换片段',
  replace_doc: '替换整篇文档',
}

export function AIDiffPreview({ edit, onAccept, onReject }: AIDiffPreviewProps) {
  return (
    <div className="border border-[var(--accent)] rounded-md overflow-hidden">
      <div className="px-2 py-1 text-xs bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-between">
        <span>AI 建议：{KIND_LABEL[edit.kind]}</span>
      </div>
      <div className="p-2 text-sm whitespace-pre-wrap bg-[var(--bg-soft)] max-h-60 overflow-y-auto">
        {edit.text || '(empty)'}
      </div>
      <div className="flex justify-end gap-2 p-2 border-t border-[var(--border)]">
        <button
          onClick={onReject}
          className="text-xs px-3 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-soft)]"
        >
          忽略
        </button>
        <button
          onClick={onAccept}
          className="text-xs px-3 py-1 rounded bg-[var(--accent)] text-white"
        >
          应用
        </button>
      </div>
    </div>
  )
}
