import { UploadWidget } from "../components/UploadWidget.js";
import { DocumentList } from "../components/DocumentList.js";
import { ChatPanel } from "../components/ChatPanel.js";

export function App() {
  return (
    <div className="app-shell">
      <header>
        <h1>Knowledge Base Search</h1>
        <p>Upload PDFs, then ask questions grounded in their content — charts included.</p>
      </header>
      <ChatPanel />
      <UploadWidget />
      <DocumentList />
    </div>
  );
}
