import React from 'react';
import { ClipboardCheck, Ship, Anchor, Warehouse } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const ProductionIcon = ({ size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="-1 -1 26 26"
    fill="currentColor"
    style={{ flexShrink: 0 }}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M4 0H20A4 4 0 0 1 24 4V20A4 4 0 0 1 20 24H4A4 4 0 0 1 0 20V4A4 4 0 0 1 4 0ZM4 2H9V2.8A3 3 0 0 0 11 5.63V7A1 1 0 0 0 13 7V5.63A3 3 0 0 0 15 2.8V2H20A2 2 0 0 1 22 4V17H2V4A2 2 0 0 1 4 2ZM4.5 19A1.5 1.5 0 1 0 4.5 22A1.5 1.5 0 1 0 4.5 19ZM8.5 19A1.5 1.5 0 1 0 8.5 22A1.5 1.5 0 1 0 8.5 19ZM19.5 19A1.5 1.5 0 1 0 19.5 22A1.5 1.5 0 1 0 19.5 19Z"
    />
    <rect x="8" y="10" width="8" height="5" rx="2" />
  </svg>
);

export default function StepBar({ currentStatus }) {
  const { t } = useTranslation();

  const STEPS = [
    { key: 'CONFIRMED', label: t('stepbar.confirmed', '주문'), icon: ClipboardCheck },
    { key: 'IN_PRODUCTION', label: t('stepbar.in_production', '생산'), icon: ProductionIcon },
    { key: 'SHIPPING', label: t('stepbar.shipping', '배송'), icon: Ship },
    { key: 'ARRIVED', label: t('stepbar.arrived', '항구도착'), icon: Anchor },
    { key: 'IN_STOCK', label: t('stepbar.in_stock', '입고'), icon: Warehouse },
  ];

  const currentIndex = STEPS.findIndex(s => s.key === currentStatus);

  return (
    <div className="step-bar-container">
      {STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isActive = index === currentIndex;
        const IconComponent = step.icon;
        
        let dotClass = "step-dot";
        if (isCompleted) dotClass += " completed";
        if (isActive) dotClass += " active";

        let labelClass = "step-label";
        if (isActive || isCompleted) labelClass += " active";

        return (
          <div key={step.key} className="step-node">
            <div className={dotClass} style={isActive ? { position: 'relative' } : {}}>
              <IconComponent size={18} strokeWidth={1.5} />
            </div>
            <span className={labelClass} style={isActive ? { color: 'var(--step-color)', fontWeight: 800 } : {}}>{step.label}</span>
            {index < STEPS.length - 1 && (
              <div className="step-connector">
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
