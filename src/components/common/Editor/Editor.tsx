import React, { useMemo, useRef } from 'react';
import './Editor.css';

interface EditorProps {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  language?: 'json' | 'text';
}

const JSON_TOKEN_REGEX =
  /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightJSON(json: string): string {
  if (!json.trim()) return escapeHtml(json);

  try {
    JSON.parse(json);
  } catch {
    return escapeHtml(json);
  }

  let result = '';
  let lastIndex = 0;

  for (const match of json.matchAll(JSON_TOKEN_REGEX)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      result += escapeHtml(json.slice(lastIndex, index));
    }

    const [full, strToken, colonToken, boolToken, nullToken, numToken] = match;

    if (strToken !== undefined) {
      if (colonToken !== undefined) {
        result += `<span class="json-key">${escapeHtml(strToken)}</span>${escapeHtml(colonToken)}`;
      } else {
        result += `<span class="json-string">${escapeHtml(strToken)}</span>`;
      }
    } else if (boolToken !== undefined) {
      result += `<span class="json-boolean">${boolToken}</span>`;
    } else if (nullToken !== undefined) {
      result += `<span class="json-null">${nullToken}</span>`;
    } else if (numToken !== undefined) {
      result += `<span class="json-number">${numToken}</span>`;
    } else {
      result += escapeHtml(full);
    }

    lastIndex = index + full.length;
  }

  if (lastIndex < json.length) {
    result += escapeHtml(json.slice(lastIndex));
  }

  return result;
}

export default function Editor({
  value,
  onChange,
  placeholder,
  readOnly = false,
  language = 'text',
}: EditorProps) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lineCount = Math.max(value.split('\n').length, 1);

  const highlightedHTML = useMemo(() => {
    if (language === 'json' && value.trim()) {
      return highlightJSON(value);
    }
    return escapeHtml(value);
  }, [value, language]);

  const handleReadOnlyScroll = (e: React.UIEvent<HTMLPreElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleTextareaScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    if (gutterRef.current) {
      gutterRef.current.scrollTop = target.scrollTop;
    }
    if (highlightRef.current) {
      highlightRef.current.scrollTop = target.scrollTop;
      highlightRef.current.scrollLeft = target.scrollLeft;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && onChange) {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const nextValue = `${value.slice(0, start)}  ${value.slice(end)}`;
      onChange(nextValue);

      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = start + 2;
          textareaRef.current.selectionEnd = start + 2;
        }
      });
    }
  };

  return (
    <div className="editor-container">
      <div className="editor-gutter" ref={gutterRef}>
        {Array.from({ length: lineCount }).map((_, i) => (
          <div key={i} className="editor-line-number">
            {i + 1}
          </div>
        ))}
      </div>

      {readOnly ? (
        <pre
          className={`editor-content ${language === 'json' ? 'json-editor' : ''}`}
          onScroll={handleReadOnlyScroll}
          data-placeholder={placeholder}
        >
          {value ? (
            <code dangerouslySetInnerHTML={{ __html: highlightedHTML }} />
          ) : (
            placeholder ? <span className="editor-placeholder">{placeholder}</span> : null
          )}
        </pre>
      ) : (
        <div className="editor-editable-wrapper">
          <pre
            ref={highlightRef}
            className={`editor-content editor-highlight ${language === 'json' ? 'json-editor' : ''}`}
            aria-hidden="true"
            dangerouslySetInnerHTML={{
              __html: `${highlightedHTML}${value.endsWith('\n') ? ' ' : ''}`,
            }}
          />
          <textarea
            ref={textareaRef}
            className="editor-content editor-textarea"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            onScroll={handleTextareaScroll}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}
