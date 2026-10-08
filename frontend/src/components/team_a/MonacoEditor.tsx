import { useEffect, useRef, useState } from "react";
import "./MonacoEditor.css";
import Editor, { type OnMount } from "@monaco-editor/react";

const API = (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8000";

const languages = [
  { label: "C++ (g++ 17)", value: "cpp" },
  { label: "Python (3.11)", value: "python" },
  { label: "Java (OpenJDK 17)", value: "java" },
  { label: "C (gcc 11)", value: "c" },
  { label: "JavaScript (Node 20)", value: "javascript" },
];

const DEFAULT_BOILERPLATES: Record<string, string> = {
  python: `# Write your solution below\ndef solution():\n    pass\n`,
  cpp: `#include <iostream>\n#include <vector>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n`,
  c: `#include <stdio.h>\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n`,
  java: `import java.util.*;\n\npublic class Solution {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}\n`,
  javascript: `// Write your solution below\nfunction solution() {\n    \n}\n`,
};

export type MonacoTheme = "vs-dark" | "vs-light" | "hc-black";

type MonacoEditorProps = {
  userId?: string;
  sessionId?: string;
  questionId: string;
  theme?: MonacoTheme;
  fontSize?: number;
  height?: string;
  showMinimap?: boolean;
  selectedLanguage?: string;
  onLanguageChange?: (lang: string) => void;
  onCodeChange: (code: string, language: string) => void;
};

export function MonacoEditor({
  userId = "guest",
  sessionId = "practice",
  questionId,
  theme = "vs-dark",
  fontSize = 14,
  height = "100%",
  showMinimap = false,
  selectedLanguage,
  onLanguageChange,
  onCodeChange,
}: MonacoEditorProps) {
  const [language, setLanguage] = useState(selectedLanguage || "cpp");

  const [codeByQuestionAndLanguage, setCodeByQuestionAndLanguage] = useState<
    Record<string, Record<string, string>>
  >({});

  const draftIdByQuestionAndLanguage = useRef<
    Record<string, Record<string, string>>
  >({});

  // Sync external language change if provided
  useEffect(() => {
    if (selectedLanguage && selectedLanguage !== language) {
      setLanguage(selectedLanguage);
    }
  }, [selectedLanguage]);

  const currentQuestionCodes = codeByQuestionAndLanguage[questionId] || {};
  const sourceCode =
    currentQuestionCodes[language] !== undefined
      ? currentQuestionCodes[language]
      : DEFAULT_BOILERPLATES[language] || "";

  // Auto-save draft on debounce
  useEffect(() => {
    if (!sourceCode) return;

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${API}/api/code/drafts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            draft_id:
              draftIdByQuestionAndLanguage.current[questionId]?.[language] ??
              null,
            user_id: userId,
            session_id: sessionId,
            question_id: questionId,
            language,
            source_code: sourceCode,
          }),
        });

        if (!response.ok) return;

        const draft = await response.json();
        if (!draftIdByQuestionAndLanguage.current[questionId]) {
          draftIdByQuestionAndLanguage.current[questionId] = {};
        }
        draftIdByQuestionAndLanguage.current[questionId][language] = draft.id;
      } catch (error) {
        // Silently capture draft save warning
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [sourceCode, language, userId, sessionId, questionId]);

  const handleLanguageChange = (nextLanguage: string) => {
    setLanguage(nextLanguage);
    onLanguageChange?.(nextLanguage);
    const existingCode =
      codeByQuestionAndLanguage[questionId]?.[nextLanguage] ??
      DEFAULT_BOILERPLATES[nextLanguage] ??
      "";
    onCodeChange(existingCode, nextLanguage);
  };

  const handleEditorChange = (value: string | undefined) => {
    const newCode = value ?? "";
    setCodeByQuestionAndLanguage((prev) => ({
      ...prev,
      [questionId]: {
        ...(prev[questionId] || {}),
        [language]: newCode,
      },
    }));
    onCodeChange(newCode, language);
  };

  const handleEditorMount: OnMount = (editorInstance) => {
    const editorElement = editorInstance.getDomNode();
    if (!editorElement) return;

    const blockPaste = (event: ClipboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const blockDrop = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const blockKeyboardPaste = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "v"
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    editorElement.addEventListener("paste", blockPaste);
    editorElement.addEventListener("drop", blockDrop);
    editorElement.addEventListener("keydown", blockKeyboardPaste);
  };

  return (
    <div className="w-full h-full flex flex-col bg-inherit overflow-hidden">
      <div className="flex-1 w-full h-full min-h-[260px] relative">
        <Editor
          height={height}
          language={language === "c" || language === "cpp" ? "cpp" : language}
          onMount={handleEditorMount}
          value={sourceCode}
          theme={theme}
          onChange={handleEditorChange}
          options={{
            minimap: {
              enabled: showMinimap,
            },
            fontSize: fontSize,
            fontFamily: "'Fira Code', 'Cascadia Code', Consolas, 'Courier New', monospace",
            fontLigatures: true,
            lineNumbers: "on",
            roundedSelection: true,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            dragAndDrop: false,
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
            parameterHints: {
              enabled: true,
            },
            wordWrap: "on",
            tabSize: 4,
            bracketPairColorization: {
              enabled: true,
            },
            renderLineHighlight: "all",
          }}
        />
      </div>
    </div>
  );
}

export default MonacoEditor;