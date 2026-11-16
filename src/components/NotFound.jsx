import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button, StatusScreen } from '../ui';

export default function NotFound() {
  useEffect(() => {
    document.title = 'Page not found | Its Games Night';
  }, []);

  return (
    <StatusScreen
      icon={Compass}
      title="Page not found"
      message="That link doesn't lead anywhere. Head home to host a room or join one with a code."
    >
      <Button as={Link} to="/" block>Go to home</Button>
    </StatusScreen>
  );
}
