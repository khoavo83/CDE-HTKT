import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
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
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50">
                    <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
                        <div className="text-5xl mb-4">⚠️</div>
                        <h2 className="text-xl font-bold text-gray-800 mb-2">Có lỗi xảy ra</h2>
                        <p className="text-gray-600 text-sm mb-4">
                            {this.state.error?.message || 'Đã xảy ra lỗi không xác định.'}
                        </p>
                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={() => window.location.href = '/'}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium"
                            >
                                🏠 Về trang chủ
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition font-medium"
                            >
                                🔄 Tải lại trang
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
