import React from 'react';
import logo from '../assets/itsgamesnight-logo.webp';

const SIZES = {
  compact: 'h-8',
  hero: 'h-14 sm:h-16'
};

export default function GameNightLogo({ size = 'compact', className = '' }) {
  return (
    <img
      src={logo}
      alt="Its Games Night"
      width="500"
      height="118"
      className={`${SIZES[size] || SIZES.compact} w-auto ${className}`.trim()}
    />
  );
}
