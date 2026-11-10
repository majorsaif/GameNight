import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center text-center gap-5 px-6">
        <div className="text-5xl" aria-hidden="true">🎲</div>
        <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
        <p className="text-slate-400 max-w-sm">
          The page hit an unexpected error. Reloading usually fixes it, and you&apos;ll be put back in your room.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl"
          >
            Reload
          </button>
          <a href="/" className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl">
            Home
          </a>
        </div>
      </div>
    );
  }
}
