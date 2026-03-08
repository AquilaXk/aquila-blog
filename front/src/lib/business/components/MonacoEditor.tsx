"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    require: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    monaco: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

export default function MonacoEditor({
  initialValue,
  className = "",
  onSave,
  onChange,
  theme,
}: {
  initialValue: string;
  className?: string;
  onSave?: (value: string) => void;
  onChange?: (value: string) => void;
  theme: "light" | "dark";
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const monacoRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const onSaveRef = useRef(onSave);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onSaveRef.current = onSave;
    onChangeRef.current = onChange;
  }, [onSave, onChange]);

  useEffect(() => {
    if (typeof window === "undefined" || !editorRef.current) return;

    // D2Coding 웹폰트 로드
    const fontLink = document.createElement("link");
    fontLink.href =
      "https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_three@1.0/D2Coding.woff";
    fontLink.rel = "stylesheet";
    document.head.appendChild(fontLink);

    const initMonaco = () => {
      window.require.config({
        paths: {
          vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs",
        },
      });

      window.require(["vs/editor/editor.main"], () => {
        monacoRef.current?.dispose();

        monacoRef.current = window.monaco.editor.create(editorRef.current!, {
          value: initialValue,
          language: "markdown",
          theme: theme === "dark" ? "vs-dark" : "vs",
          tabSize: 2,
          mouseWheelZoom: true,
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 16,
          wordWrap: "on",
          lineNumbers: "on",
          fontFamily: "D2Coding",
          fontLigatures: true,
        });

        monacoRef.current.onDidChangeModelContent(() => {
          onChangeRef.current?.(monacoRef.current?.getValue() || "");
        });

        monacoRef.current.addCommand(
          window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyS,
          () => {
            onSaveRef.current?.(monacoRef.current?.getValue() || "");
          },
        );
      });
    };

    if (!window.require) {
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/loader.min.js";
      script.onload = initMonaco;
      document.head.appendChild(script);
    } else {
      initMonaco();
    }

    return () => {
      monacoRef.current?.dispose();
      document.head.removeChild(fontLink);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (monacoRef.current) {
      window.monaco.editor.setTheme(theme === "dark" ? "vs-dark" : "vs");
    }
  }, [theme]);

  return <div ref={editorRef} className={className} />;
}
