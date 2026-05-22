interface HtmlPreviewProps {
  content: string
}

/**
 * Renders untrusted HTML inside an iframe with an empty sandbox attribute.
 *
 * `sandbox=""` (no allow-* tokens) blocks: script execution, form submission,
 * popups, top-level navigation, same-origin DOM/storage access. The user sees
 * styled markup but nothing inside can affect the host process.
 */
export function HtmlPreview({ content }: HtmlPreviewProps) {
  return (
    <iframe
      className="html-preview-frame"
      sandbox=""
      srcDoc={content}
      title="HTML preview"
    />
  )
}
