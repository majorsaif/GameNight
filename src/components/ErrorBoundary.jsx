import React from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Button, StatusScreen } from '../ui';

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
      <StatusScreen
        icon={TriangleAlert}
        tone="danger"
        title="Something went wrong"
        message="Reload the page to carry on. If you were in a room, you'll go straight back to it."
      >
        <Button icon={RotateCcw} block onClick={() => window.location.reload()}>Reload</Button>
        <Button as="a" href="/" variant="secondary" block>Go to home</Button>
      </StatusScreen>
    );
  }
}
