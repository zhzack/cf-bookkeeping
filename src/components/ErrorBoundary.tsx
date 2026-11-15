import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const isChunkError =
        this.state.error?.name === 'ChunkLoadError' ||
        this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
        this.state.error?.message?.includes('Loading chunk');

      return (
        <div className="min-h-[280px] p-6 flex items-center justify-center">
          <div className="bg-white rounded-3xl border border-red-100 shadow-xl shadow-red-50/50 p-6 max-w-md w-full text-center space-y-4">
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-800">
                {this.props.fallbackTitle || (isChunkError ? '页面组件加载失败' : '视图渲染异常')}
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                {isChunkError
                  ? '检测到网络连接抖动或版本更新，未能成功加载该功能模块。'
                  : (this.state.error?.message || '组件渲染过程中发生了意外错误。')}
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors"
              >
                重试加载
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
              >
                <RefreshCw className="w-4 h-4" />
                刷新页面
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
