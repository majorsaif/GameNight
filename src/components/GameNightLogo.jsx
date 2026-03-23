import React from 'react';
import logo from '../assets/itsgamesnight-logo.png';

export default function GameNightLogo({ size = 'compact', className = '' }) {
  const logoSizeClass = size === 'hero' ? 'h-20' : 'h-8';

  return (
    <img
      src={logo}
      alt="Its Games Night"
      className={`${logoSizeClass} w-auto ${className}`.trim()}
    />
  );
}
