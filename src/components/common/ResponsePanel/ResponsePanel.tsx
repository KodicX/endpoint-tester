import { useState } from "react";
import { getStatusLabel, type RequestResponse } from "../../../utils/storage";
import Editor from "../Editor/Editor";
import "./ResponsePanel.css";
import { toast } from "sonner";

interface ResponsePanelProps {
  response: RequestResponse | null;
  isLoading: boolean;
  getStatusCategory: (status: number) => string;
}

export default function ResponsePanel({
  response,
  isLoading,
  getStatusCategory,
}: ResponsePanelProps) {
  const [prettyPrint, setPrettyPrint] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [responseTab, setResponseTab] = useState<"body" | "headers">("body");
  const [prevResponse, setPrevResponse] = useState<RequestResponse | null>(null);

  if (response !== prevResponse) {
    setPrevResponse(response);
    if (response !== null) {
      setPrettyPrint(true);
      setResponseTab("body");
      setCopied(false);
    }
  }

  const hasData =
    response !== null && response.data !== null && response.data !== undefined;
  const isJsonData = hasData && typeof response.data !== "string";

  const responseBody = hasData
    ? typeof response.data === "string"
      ? response.data
      : prettyPrint
        ? JSON.stringify(response.data, null, 2)
        : JSON.stringify(response.data)
    : "";

  async function handleCopyResponse(): Promise<void> {
    if (!hasData || responseBody === "") {
      toast.error("No response data to copy!");
      return;
    }

    try {
      await navigator.clipboard.writeText(responseBody);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Response copied to clipboard!");
    } catch {
      toast.error("Failed to copy response to clipboard");
    }
  }

  function formatSize(bytes?: number): string {
    if (bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) {
      return "0 B";
    }
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.min(
      Math.floor(Math.log(bytes) / Math.log(k)),
      sizes.length - 1,
    );
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  const headerEntries = response ? Object.entries(response.headers) : [];
  const statusLabel = response
    ? response.status === 0
      ? "Network Error"
      : `${response.status} ${response.statusText || getStatusLabel(response.status)}`
    : "";

  return (
    <div className="response-panel">
      {!response && !isLoading && (
        <div className="response-empty">
          Send a request to see the response.
        </div>
      )}

      {isLoading && <div className="response-empty">Sending request...</div>}

      {response && !isLoading && (
        <>
          <div className="response-meta">
            <span
              className={`status-badge ${getStatusCategory(response.status)}`}
            >
              {statusLabel}
            </span>
            <span className="response-time">
              {Math.round(response.responseTime)} ms
            </span>
            <span className="response-size">{formatSize(response.size)}</span>

            <div className="response-tabs-mini">
              <button
                className={`mini-tab ${responseTab === "body" ? "active" : ""}`}
                onClick={() => setResponseTab("body")}
              >
                Body
              </button>
              <button
                className={`mini-tab ${responseTab === "headers" ? "active" : ""}`}
                onClick={() => setResponseTab("headers")}
              >
                Headers
              </button>
            </div>

            {!response.isError && responseTab === "body" && (
              <>
                {isJsonData && (
                  <button
                    className="pretty-toggle"
                    onClick={() => setPrettyPrint((prev) => !prev)}
                  >
                    {prettyPrint ? "Raw" : "Pretty"}
                  </button>
                )}
                <button className="pretty-toggle" onClick={handleCopyResponse}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </>
            )}
          </div>

          {response.isError ? (
            <div className="response-body">
              <span className="response-error">{response.errorMessage}</span>
            </div>
          ) : responseTab === "body" ? (
            <div className="response-body-editor">
              <Editor
                value={responseBody}
                readOnly={true}
                placeholder="Empty response body"
                language={prettyPrint && isJsonData ? "json" : "text"}
              />
            </div>
          ) : (
            <div className="response-headers-list">
              {headerEntries.length === 0 ? (
                <div className="response-empty">
                  No response headers exposed (CORS may restrict visible headers).
                </div>
              ) : (
                headerEntries.map(([key, value]) => (
                  <div key={key} className="response-header-item">
                    <span className="header-key">{key}:</span>
                    <span className="header-value">{String(value)}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}