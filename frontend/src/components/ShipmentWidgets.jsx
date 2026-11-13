import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { checkIsDelayed } from '../utils/geoUtils';

export function InventoryAgingWidget({ orders }) {
  const now = new Date();
  let normal = 0, longTerm = 0, bad = 0;

  if (orders && orders.length > 0) {
    orders.forEach(order => {
      if (order.current_status === 'IN_STOCK' && order.actual_date) {
        const daysInStock = Math.floor((now - new Date(order.actual_date)) / (1000 * 60 * 60 * 24));
        if (daysInStock <= 180) normal++;
        else if (daysInStock <= 360) longTerm++;
        else bad++;
      }
    });
  } else {
    normal = 120;
    longTerm = 25;
    bad = 5;
  }

  const total = normal + longTerm + bad;

  const data = [
    { name: '일반 (0~180일)', value: normal, color: '#4ade80' },
    { name: '장기 (181~360일)', value: longTerm, color: '#facc15' },
    { name: '악성 (361일 이상)', value: bad, color: '#f87171' },
  ];

  return (
    <div style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '8px' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#1f2937', margin: 0 }}>재고 에이징 비율</h3>
        <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>항구 하역 후 보관 기간 기준</p>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: '50%', height: '160px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value">
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [`${value} 대`, '재고 수량']} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ width: '50%', paddingLeft: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ marginBottom: '12px' }}>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', marginTop: 0 }}>총 가용 재고</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937', margin: 0 }}>{total} <span style={{ fontSize: '0.875rem', fontWeight: 'normal' }}>대</span></p>
          </div>
          <div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', marginTop: 0 }}>장기/악성 점유율</p>
            <p style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#ef4444', margin: 0 }}>{((longTerm + bad) / (total || 1) * 100).toFixed(1)}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DelayRateWidget({ shipments, isMobileView = false }) {
  let totalActive = 0;
  let delayed = 0;

  if (Array.isArray(shipments) && shipments.length > 0) {
    shipments.forEach(s => {
      totalActive++;
      const isShipmentArrived = Boolean(
        s.is_arrived ||
        /arrived|discharged|picked up|delivered|입고|도착/i.test(s.tracking_status_detail || s.trackcargo_status || s.status) ||
        (s.eta && new Date(s.eta) <= new Date())
      );
      const isDelayed = isShipmentArrived ? false : checkIsDelayed(s);
      if (isDelayed) {
        delayed++;
      }
    });
  }

  const onTime = totalActive - delayed;
  const delayRateNum = totalActive > 0 ? (delayed / totalActive) * 100 : 0;
  const delayRate = delayRateNum.toFixed(1);

  let statusColor = '#22c55e'; // green-500
  if (delayRateNum > 0 && delayRateNum <= 20) statusColor = '#eab308'; // yellow-500
  if (delayRateNum > 20) statusColor = '#ef4444'; // red-500

  const data = totalActive > 0
    ? [
        { name: '정상 운항', value: onTime, color: '#4ade80' },
        { name: '지연 선박', value: delayed, color: '#f87171' },
      ]
    : [
        { name: '조회 중 / 없음', value: 1, color: '#e2e8f0' },
      ];

  return (
    <div style={{
      backgroundColor: '#fff',
      padding: isMobileView ? '14px 16px' : '16px',
      borderRadius: '12px',
      boxShadow: isMobileView ? '0 1px 3px rgba(0,0,0,0.05)' : '0 4px 6px -1px rgba(0,0,0,0.1)',
      border: '1px solid #e2e8f0',
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      <div style={{ marginBottom: '8px' }}>
        <h3 style={{ fontSize: isMobileView ? '1rem' : '1.125rem', fontWeight: 'bold', color: '#1f2937', margin: 0 }}>해상 운송 지연율</h3>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: '50%', height: isMobileView ? '135px' : '160px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="70%" startAngle={180} endAngle={0} innerRadius={50} outerRadius={70} paddingAngle={delayed > 0 && onTime > 0 ? 2 : 0} dataKey="value">
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              {totalActive > 0 && (
                <Tooltip formatter={(value, name) => [`${value} 건`, name]} />
              )}
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ width: '50%', paddingLeft: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ marginBottom: '12px' }}>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', marginTop: 0 }}>전체 운송 중 선박</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937', margin: 0 }}>{totalActive} <span style={{ fontSize: '0.875rem', fontWeight: 'normal' }}>건</span></p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>지연율</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: statusColor, lineHeight: 1 }}>{delayRate}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
