import React from 'react';
import { ClipboardCheck, Ship, Anchor, Warehouse } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const ProductionIcon = ({ size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 150 150"
    fill="currentColor"
    style={{ flexShrink: 0 }}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M15 0H135A15 15 0 0 1 150 15V150H0V15A15 15 0 0 1 15 0ZM12 18A6 6 0 0 1 18 12H56V23L69 36V49H81V36L94 23V12H132A6 6 0 0 1 138 18V106H12V18ZM21.5 118.5A9 9 0 1 0 21.5 136.5A9 9 0 1 0 21.5 118.5ZM46.5 118.5A9 9 0 1 0 46.5 136.5A9 9 0 1 0 46.5 118.5ZM127.5 118.5A9 9 0 1 0 127.5 136.5A9 9 0 1 0 127.5 118.5ZM50 63H100V93H50Z"
    />
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
