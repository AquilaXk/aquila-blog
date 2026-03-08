"use client";

import dynamic from "next/dynamic";

import { forwardRef } from "react";

import { ToastUIEditorViewerCoreProps } from "./ToastUIEditorViewerCore";

const ToastUIEditorViewerCore = dynamic(
  () => import("./ToastUIEditorViewerCore"),
  {
    ssr: false,
    loading: () => <div>로딩중...</div>,
  },
);

type ViewerProps = ToastUIEditorViewerCoreProps;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ToastUIEditorViewer = forwardRef<any, ViewerProps>((props, ref) => {
  return <ToastUIEditorViewerCore ref={ref} {...props} />;
});

ToastUIEditorViewer.displayName = "ToastUIEditorViewer";

export default ToastUIEditorViewer;
