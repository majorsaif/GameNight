import React from 'react';
import { Stepper } from '../ui';

// Temporary shim while Pass & Play is rebuilt on the design system.
export default function AnimatedNumberStepper({ value, min, max, onChange, formatValue }) {
  return <Stepper label="" value={value} min={min} max={max} onChange={onChange} format={formatValue} />;
}
