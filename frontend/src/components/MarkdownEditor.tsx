import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import useLocalStorage from "./useLocalStorage";
import CodeTranslator from "./CodeTranslator";
import {
  Bold,
  Italic,
  Terminal,
  FolderDown,
  ChevronDown,
  X,
  FileDiff,
  Copy,
  Check,
  ArrowLeftRight,
  FileInput,
  FileUp,
  FileDown,
  Image,
  Database,
  Code,
} from "lucide-react";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onImage: () => void;
  onDatabase: () => void;
  onDownload: () => void;
  onTranslate?: (
    source: string,
    sourceLang: string,
    targetLang: string
  ) => Promise<string>;
  placeholder?: string;
  disabled?: boolean;
}

const SUPPORTED_LANGUAGES = [
  // Popular General Purpose
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "C#",
  "C++",
  "C",
  "Go",
  "Rust",
  "Swift",
  "Kotlin",
  "Dart",
  "Ruby",
  "PHP",
  "Scala",

  // Web Technologies
  "HTML",
  "CSS",
  "Sass",
  "Less",
  "JSX",
  "TSX",

  // Mobile Development
  "Objective-C",
  "Dart",
  "Kotlin",
  "Swift",

  // Systems Programming
  "Rust",
  "Go",
  "Zig",
  "Nim",

  // Functional Programming
  "Haskell",
  "Elm",
  "F#",
  "OCaml",
  "Clojure",
  "Erlang",
  "Elixir",

  // Scripting Languages
  "Bash",
  "PowerShell",
  "Perl",
  "Lua",
  "Raku",
  "Groovy",

  // Data Science & Analytics
  "R",
  "Julia",
  "MATLAB",
  "SAS",

  // Database & Query Languages
  "SQL",
  "PL/SQL",
  "T-SQL",
  "GraphQL",

  // Configuration & Markup
  "YAML",
  "JSON",
  "XML",
  "TOML",
  "HCL",
  "MARKDOWN",
  "PLAINTEXT",

  // Game Development
  "GDScript",
  "UnrealScript",
  "HLSL",
  "GLSL",

  // Other Notable Languages
  "Fortran",
  "COBOL",
  "Lisp",
  "Scheme",
  "Prolog",
  "Ada",
  "D",
  "V",
  "Red",
  "Reason",
  "PureScript",
  "Idris",
] as const;

const FILE_EXTENSIONS =
  ".txt,.md,.markdown,.json,.js,.ts,.jsx,.tsx,.py,.html,.uc,.css,.scss,.less,.sql,.yaml,.yml,.cpp,.c,.h,.hpp,.cc,.java,.kt,.go,.rs,.php,.rb,.sh,.pl,.pm,.lua,.r,.m,.swift,.scala,.groovy,.dart,.elm,.clj,.cljs,.cljc,.edn,.ex,.exs,.hs,.purs,.erl,.hrl,.fs,.fsx,.fsi,.v,.sv,.vhd,.vhdl,.tex,.bib,.rkt,.rktl,.rktd,.scrbl,.plt,.ss,.sch,.rkt~,.st,.cs,.vb,.fs,.fsscript,.fsharp,.pas,.pp,.inc,.lpr,.dpr,.adb,.ads,.ada,.asm,.s,.S,.inc,.ino,.pde,.coffee,.litcoffee,.iced,.jl,.tcl,.nim,.zig,.v,.sv,.svh,.uc,.uci,.upkg,.nut,.vala,.vapi,.gml,.gmx,.yy,.yyp,.gmx,.project.gmx,.gm81,.gmk,.gm6,.gmd,.gms,.agc,.aea,.tex,.sty,.cls,.bst,.bib,.Rnw,.Rmd,.Rd,.Rtex,.Rhtml,.Rcss,.Rjs,.jl,.ipynb";

type Language = (typeof SUPPORTED_LANGUAGES)[number];

type DiffLine = {
  type: "unchanged" | "added" | "removed" | "empty";
  leftLine?: string;
  rightLine?: string;
  lineNumber?: number;
};

const MarkdownEditor = forwardRef<HTMLTextAreaElement, MarkdownEditorProps>(
  (
    {
      value,
      placeholder,
      onChange,
      onSubmit,
      onImage,
      onDatabase,
      onDownload,
      onTranslate,
      disabled,
    },
    ref
  ) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => textareaRef.current!);

    const insertText = (prefix: string, suffix = "") => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = value.substring(start, end);

      const newValue =
        value.substring(0, start) +
        prefix +
        selectedText +
        suffix +
        value.substring(end);
      onChange(newValue);

      const newCursorPosition = start + prefix.length + selectedText.length;

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursorPosition, newCursorPosition);
      }, 0);
    };
    //
    const [showTranslatorTool, setShowTranslatorTool] = useState(false);

    const prevShowDiffTool = useRef<boolean>(false);
    //
    const [showLanguages, setShowLanguages] = useState(false);
    const [showDiffTool, setShowDiffTool] = useState(false);
    const [leftDocument, setLeftDocument] = useLocalStorage<string>(
      "leftDocument-1",
      ""
    );
    const [rightDocument, setRightDocument] = useLocalStorage<string>(
      "rightDocument-1",
      ""
    );
    const [diffLines, setDiffLines] = useState<DiffLine[]>([]);
    const [copied, setCopied] = useState(false);
    const [viewMode, setViewMode] = useState<"side-by-side" | "inline">(
      "side-by-side"
    );
    const [leftFileName, setLeftFileName] = useState("");
    const [rightFileName, setRightFileName] = useState("");
    const leftFileInputRef = useRef<HTMLInputElement>(null);
    const rightFileInputRef = useRef<HTMLInputElement>(null);
    const mainFileInputRef = useRef<HTMLInputElement>(null);
    // NEW: Manage textarea height state for resizing
    const [textareaHeight, setTextareaHeight] = useLocalStorage<number>(
      "text-area-height-markdown-editor-1",
      150
    ); // initial height px
    const dragStartY = useRef<number | null>(null);
    const dragStartHeight = useRef<number>(textareaHeight);

    // Drag handle mouse down
    const onDragHandleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragStartY.current = e.clientY;
      dragStartHeight.current = textareaHeight;

      document.addEventListener("mousemove", onDragging);
      document.addEventListener("mouseup", onDragEnd);
    };

    // Mouse move - drag handler
    const onDragging = (e: MouseEvent) => {
      if (dragStartY.current === null) return;

      const deltaY = dragStartY.current - e.clientY; // drag up increases height
      let newHeight = dragStartHeight.current + deltaY;

      if (newHeight < 50) newHeight = 50; // min height
      if (newHeight > 1000) newHeight = 1000; // max height

      setTextareaHeight(newHeight);
    };

    // Mouse up - drag end
    const onDragEnd = () => {
      dragStartY.current = null;
      document.removeEventListener("mousemove", onDragging);
      document.removeEventListener("mouseup", onDragEnd);
    };

    // Double click
    const onDoubleClickMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      setTextareaHeight(250);
    };

    const formatText = (format: "bold" | "italic" | "inline-code") => {
      switch (format) {
        case "bold":
          insertText("**", "**");
          break;
        case "italic":
          insertText("*", "*");
          break;
        case "inline-code":
          insertText("`", "`");
          break;
      }
    };

    const insertCodeBlock = (language: Language) => {
      const placeholder = `\n\`\`\`${language}\n\n\`\`\`\n`;
      const textarea = textareaRef.current;

      const start = textarea?.selectionStart ?? value.length;
      const newText = value.slice(0, start) + placeholder + value.slice(start);

      onChange(newText);
      setShowLanguages(false);

      setTimeout(() => {
        if (textareaRef.current) {
          const cursorPosition = start + `\n\`\`\`${language}\n`.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
        }
      }, 0);
    };

    const compareDocuments = () => {
      if (!leftDocument || !rightDocument) {
        setDiffLines([{ type: "empty" }]);
        return;
      }

      if (leftDocument === rightDocument) {
        setDiffLines([
          { type: "unchanged", leftLine: "Documents are identical" },
        ]);
        return;
      }

      const diff = generateDiff(leftDocument, rightDocument);
      setDiffLines(diff);
    };

    const generateDiff = (left: string, right: string): DiffLine[] => {
      const leftLines = left.split("\n");
      const rightLines = right.split("\n");
      const diffLines: DiffLine[] = [];

      const maxLines = Math.max(leftLines.length, rightLines.length);

      for (let i = 0; i < maxLines; i++) {
        const leftLine = leftLines[i];
        const rightLine = rightLines[i];

        if (leftLine === rightLine) {
          diffLines.push({
            type: "unchanged",
            leftLine,
            rightLine,
            lineNumber: i + 1,
          });
        } else if (leftLine && !rightLine) {
          diffLines.push({
            type: "removed",
            leftLine,
            lineNumber: i + 1,
          });
        } else if (!leftLine && rightLine) {
          diffLines.push({
            type: "added",
            rightLine,
            lineNumber: i + 1,
          });
        } else {
          diffLines.push(
            {
              type: "removed",
              leftLine,
              lineNumber: i + 1,
            },
            {
              type: "added",
              rightLine,
              lineNumber: i + 1,
            }
          );
        }
      }

      return diffLines;
    };

    const applyDiffToEditor = () => {
      if (diffLines.length > 0) {
        const newContent = diffLines
          .filter((line) => line.type !== "removed")
          .map((line) => line.rightLine || line.leftLine || "")
          .join("\n");
        onChange(newContent);
        setShowDiffTool(false);
      }
    };

    const copyDiffToClipboard = () => {
      if (diffLines.length === 0) return;

      const diffText = diffLines
        .map((line) => {
          if (line.type === "added") return `+ ${line.rightLine}`;
          if (line.type === "removed") return `- ${line.leftLine}`;
          return `  ${line.leftLine}`;
        })
        .join("\n");

      navigator.clipboard.writeText(diffText).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    };

    const swapDocuments = () => {
      setLeftDocument(rightDocument);
      setRightDocument(leftDocument);
      setLeftFileName(rightFileName);
      setRightFileName(leftFileName);
    };

    const handleFileUpload = (
      e: React.ChangeEvent<HTMLInputElement>,
      target: "left" | "right" | "main"
    ) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (target === "left") {
          setLeftDocument(content);
          setLeftFileName(file.name);
        } else if (target === "right") {
          setRightDocument(content);
          setRightFileName(file.name);
        } else {
          onChange(content);
        }
      };
      reader.readAsText(file);
      e.target.value = ""; // Reset input to allow selecting the same file again
    };

    const triggerFileInput = (target: "left" | "right" | "main") => {
      if (target === "left" && leftFileInputRef.current) {
        leftFileInputRef.current.click();
      } else if (target === "right" && rightFileInputRef.current) {
        rightFileInputRef.current.click();
      } else if (target === "main" && mainFileInputRef.current) {
        mainFileInputRef.current.click();
      }
    };

    const exportToFile = (content: string, fileName: string) => {
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "document.txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    useEffect(() => {
      if (showDiffTool && !prevShowDiffTool.current) {
        // Diff tool just opened
        setLeftDocument(value);
        setRightDocument(value);
        setLeftFileName("");
        setRightFileName("");
        setDiffLines([]);
      }
      prevShowDiffTool.current = showDiffTool;
    }, [showDiffTool, value]);

    const handleOnTranslate = async (
      source: string,
      sourceLang: Language,
      targetLang: Language
    ): Promise<string> => {
      if (!onTranslate) {
        return Promise.resolve("");
      }

      // Language type is already a string (the specific language name)
      // So we can use them directly as strings
      return onTranslate(source, sourceLang, targetLang);
    };

    return (
      <div className="not-prose p-0 m-0 !p-0 !m-0">
        <div className="border rounded-lg bg-white shadow-sm !mt-0 !p-0">
          <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-gray-50">
            <button
              type="button"
              onClick={() => triggerFileInput("main")}
              className="p-2 rounded hover:bg-gray-200 transition-colors"
              title="Load from file"
            >
              <FileInput className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onDownload}
              className="p-2 rounded hover:bg-gray-200 transition-colors"
              title="Save to file"
            >
              <FileDown className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => formatText("bold")}
              className="p-2 rounded hover:bg-gray-200 transition-colors"
              title="Bold"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => formatText("italic")}
              className="p-2 rounded hover:bg-gray-200 transition-colors"
              title="Italic"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => formatText("inline-code")}
              className="p-2 rounded hover:bg-gray-200 transition-colors"
              title="Inline Code"
            >
              <Terminal className="w-4 h-4" />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLanguages((prev) => !prev)}
                className="flex items-center gap-1 p-2 rounded hover:bg-gray-200 transition-colors"
                title="Insert Code Block"
              >
                <FolderDown className="w-4 h-4" />
                <ChevronDown className="w-3 h-3" />
              </button>
              {showLanguages && (
                <div className="absolute top-full left-0 mt-1 p-2 bg-white rounded-lg shadow-lg border z-10 min-w-[150px]">
                  <div className="flex justify-between items-center mb-2 pb-2 border-b">
                    <span className="text-sm font-medium text-gray-700">
                      Select Language
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowLanguages(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    {SUPPORTED_LANGUAGES.map((lang, index) => (
                      <button
                        key={`${lang}-${index}`}
                        type="button"
                        onClick={() => insertCodeBlock(lang)}
                        className="w-full text-left px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 rounded"
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowDiffTool((prev) => !prev)}
              className="p-2 rounded hover:bg-gray-200 transition-colors"
              title="Compare Documents"
            >
              <FileDiff className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowTranslatorTool((prev) => !prev)}
              className="p-2 rounded hover:bg-gray-200 transition-colors"
              title="Code Translator"
            >
              <Code className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onImage()}
              className="p-2 rounded hover:bg-gray-200 transition-colors"
              title="Gpt-Image-1"
            >
              <Image className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onDatabase()}
              className="p-2 rounded hover:bg-gray-200 transition-colors"
              title="Rag Database"
            >
              <Database className="w-4 h-4" />
            </button>
            <div className="p-2 rounded hover:bg-gray-200 transition-colors">
              <a
                id="w-support"
                className="w-support"
                href="https://www.buymeacoffee.com/gabzlabs"
                target="_blank"
                rel="noreferrer"
                title="Thanks for using"
              ></a>
            </div>
            <div className="p-2 rounded hover:bg-gray-200 transition-colors">
              <a
                id="g-support"
                className="g-support"
                href="https://github.com/songdrop"
                target="_blank"
                rel="noreferrer"
                title="GitHub"
              ></a>
            </div>
          </div>

          <input
            type="file"
            ref={mainFileInputRef}
            onChange={(e) => handleFileUpload(e, "main")}
            accept={FILE_EXTENSIONS}
            className="hidden"
          />
          {showTranslatorTool && (
            <CodeTranslator
              defaultSourceLanguage="JavaScript"
              defaultTargetLanguages={["TypeScript", "Python", "Java"]}
              onTranslate={handleOnTranslate}
              onClose={() => setShowTranslatorTool(false)}
              initialSourceCode="// Enter your JavaScript code here"
            />
          )}
          {showDiffTool && (
            <div className="p-4 border-b bg-gray-50">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-800">
                  Document Comparison
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setViewMode(
                        viewMode === "side-by-side" ? "inline" : "side-by-side"
                      )
                    }
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                    title="Toggle view mode"
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                    {viewMode === "side-by-side" ? "Inline" : "Side-by-side"}
                  </button>
                  <button
                    onClick={swapDocuments}
                    className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                    title="Swap documents"
                  >
                    Swap
                  </button>
                </div>
              </div>

              <input
                type="file"
                ref={leftFileInputRef}
                onChange={(e) => handleFileUpload(e, "left")}
                accept={FILE_EXTENSIONS}
                className="hidden"
              />
              <input
                type="file"
                ref={rightFileInputRef}
                onChange={(e) => handleFileUpload(e, "right")}
                accept={FILE_EXTENSIONS}
                className="hidden"
              />

              {viewMode === "side-by-side" ? (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-medium text-gray-700">
                        Original Document
                      </label>
                      <div className="flex gap-1">
                        <button
                          onClick={() => triggerFileInput("left")}
                          className="p-1 text-gray-500 hover:text-gray-700"
                          title="Load from file"
                        >
                          <FileInput className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            exportToFile(
                              leftDocument,
                              leftFileName || "original.txt"
                            )
                          }
                          className="p-1 text-gray-500 hover:text-gray-700"
                          title="Save to file"
                        >
                          <FileDown className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {leftFileName && (
                      <div className="text-xs text-gray-500 mb-1 truncate">
                        File: {leftFileName}
                      </div>
                    )}
                    <textarea
                      value={leftDocument}
                      onChange={(e) => setLeftDocument(e.target.value)}
                      className="w-full p-2 border rounded focus:outline-none min-h-[200px] font-mono text-sm"
                      placeholder="Paste the original document here or load from file"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-medium text-gray-700">
                        Modified Document
                      </label>
                      <div className="flex gap-1">
                        <button
                          onClick={() => triggerFileInput("right")}
                          className="p-1 text-gray-500 hover:text-gray-700"
                          title="Load from file"
                        >
                          <FileInput className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            exportToFile(
                              rightDocument,
                              rightFileName || "modified.txt"
                            )
                          }
                          className="p-1 text-gray-500 hover:text-gray-700"
                          title="Save to file"
                        >
                          <FileDown className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {rightFileName && (
                      <div className="text-xs text-gray-500 mb-1 truncate">
                        File: {rightFileName}
                      </div>
                    )}
                    <textarea
                      value={rightDocument}
                      onChange={(e) => setRightDocument(e.target.value)}
                      className="w-full p-2 border rounded focus:outline-none min-h-[200px] font-mono text-sm"
                      placeholder="Paste the modified document here or load from file"
                    />
                  </div>
                </div>
              ) : (
                <div className="mb-4">
                  <div className="grid grid-cols-2 gap-4 mb-2">
                    <div className="flex justify-between items-center">
                      <label className="block text-sm font-medium text-gray-700">
                        Original Document
                      </label>
                      <div className="flex gap-1">
                        <button
                          onClick={() => triggerFileInput("left")}
                          className="p-1 text-gray-500 hover:text-gray-700"
                          title="Load from file"
                        >
                          <FileInput className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            exportToFile(
                              leftDocument,
                              leftFileName || "original.txt"
                            )
                          }
                          className="p-1 text-gray-500 hover:text-gray-700"
                          title="Save to file"
                        >
                          <FileDown className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <label className="block text-sm font-medium text-gray-700">
                        Modified Document
                      </label>
                      <div className="flex gap-1">
                        <button
                          onClick={() => triggerFileInput("right")}
                          className="p-1 text-gray-500 hover:text-gray-700"
                          title="Load from file"
                        >
                          <FileInput className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            exportToFile(
                              rightDocument,
                              rightFileName || "modified.txt"
                            )
                          }
                          className="p-1 text-gray-500 hover:text-gray-700"
                          title="Save to file"
                        >
                          <FileDown className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-full">
                      {leftFileName && (
                        <div className="text-xs text-gray-500 mb-1 truncate">
                          File: {leftFileName}
                        </div>
                      )}
                      <textarea
                        value={leftDocument}
                        onChange={(e) => setLeftDocument(e.target.value)}
                        className="w-full p-2 border rounded focus:outline-none min-h-[200px] font-mono text-sm"
                        placeholder="Paste the original document here or load from file"
                      />
                    </div>
                    <div className="w-full">
                      {rightFileName && (
                        <div className="text-xs text-gray-500 mb-1 truncate">
                          File: {rightFileName}
                        </div>
                      )}
                      <textarea
                        value={rightDocument}
                        onChange={(e) => setRightDocument(e.target.value)}
                        className="w-full p-2 border rounded focus:outline-none min-h-[200px] font-mono text-sm"
                        placeholder="Paste the modified document here or load from file"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2 flex-wrap mb-4">
                <button
                  onClick={compareDocuments}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                    />
                  </svg>
                  Compare
                </button>
                {diffLines.length > 0 && (
                  <>
                    <button
                      onClick={applyDiffToEditor}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                    >
                      Apply Diff to Editor
                    </button>
                    <button
                      onClick={copyDiffToClipboard}
                      className="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                    >
                      {copied ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      {copied ? "Copied!" : "Copy Diff"}
                    </button>
                    <button
                      onClick={() =>
                        exportToFile(
                          diffLines
                            .map((line) => {
                              if (line.type === "added")
                                return `+ ${line.rightLine}`;
                              if (line.type === "removed")
                                return `- ${line.leftLine}`;
                              return `  ${line.leftLine}`;
                            })
                            .join("\n"),
                          "diff_result.diff"
                        )
                      }
                      className="flex items-center gap-1 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                    >
                      <FileUp className="w-4 h-4" />
                      Export Diff
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowDiffTool(false)}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                >
                  Close
                </button>
              </div>

              {diffLines.length > 0 && (
                <div className="mt-4 border rounded overflow-hidden">
                  <div className="bg-gray-100 p-2 border-b flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">
                      Comparison Results
                    </span>
                    <span className="text-xs text-gray-500">
                      {
                        diffLines.filter(
                          (l) => l.type === "added" || l.type === "removed"
                        ).length
                      }{" "}
                      changes
                    </span>
                  </div>
                  <div className="max-h-60 overflow-auto font-mono text-sm">
                    {viewMode === "side-by-side" ? (
                      <table className="w-full border-collapse">
                        <tbody>
                          {diffLines.map((line, index) => (
                            <tr
                              key={index}
                              className={
                                line.type === "added"
                                  ? "bg-green-50"
                                  : line.type === "removed"
                                  ? "bg-red-50"
                                  : ""
                              }
                            >
                              <td
                                className={`p-1 border-r ${
                                  line.type === "removed"
                                    ? "text-red-600"
                                    : "text-gray-600"
                                }`}
                              >
                                <div className="flex">
                                  <span className="w-8 text-right pr-2 text-gray-400">
                                    {line.type !== "added"
                                      ? line.lineNumber
                                      : ""}
                                  </span>
                                  <span
                                    className={
                                      line.type === "removed"
                                        ? "line-through"
                                        : ""
                                    }
                                  >
                                    {line.leftLine}
                                  </span>
                                </div>
                              </td>
                              <td
                                className={`p-1 ${
                                  line.type === "added"
                                    ? "text-green-600"
                                    : "text-gray-600"
                                }`}
                              >
                                <div className="flex">
                                  <span className="w-8 text-right pr-2 text-gray-400">
                                    {line.type !== "removed"
                                      ? line.lineNumber
                                      : ""}
                                  </span>
                                  <span>{line.rightLine}</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="p-2">
                        {diffLines.map((line, index) => (
                          <div
                            key={index}
                            className={`flex ${
                              line.type === "added"
                                ? "bg-green-50 text-green-600"
                                : line.type === "removed"
                                ? "bg-red-50 text-red-600 line-through"
                                : ""
                            }`}
                          >
                            <span className="w-8 text-right pr-2 text-gray-400">
                              {line.lineNumber}
                            </span>
                            <span className="whitespace-pre-wrap">
                              {line.type === "added" && "+ "}
                              {line.type === "removed" && "- "}
                              {line.leftLine || line.rightLine}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Resize handle centered above the textarea */}
          <div className="flex justify-center">
            <div
              onDoubleClick={onDoubleClickMouseDown}
              onMouseDown={onDragHandleMouseDown}
              className="w-12 h-2 rounded cursor-row-resize bg-gray-300 hover:bg-gray-400 my-1"
              title="Drag to resize textarea"
            />
          </div>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full p-3 focus:outline-none resize-none font-mono"
            style={{ height: textareaHeight }}
            rows={4}
          />
        </div>
      </div>
    );
  }
);

export default MarkdownEditor;
