import React, { useState } from 'react';
import Map, { Marker, NavigationControl, Source, Layer, Popup } from 'react-map-gl';
import { ChevronDown, ChevronUp, MapPin, Ship, Navigation, ArrowLeft, Trash2, Link } from 'lucide-react';
import 'mapbox-gl/dist/mapbox-gl.css';
import { DelayRateWidget } from '../../components/ShipmentWidgets';
import { useQuery } from '@tanstack/react-query';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZHVtbXkiLCJhIjoiY2x6ZHNhZHNhZHNhZHNhZHNhZHNhZHNhIn0.DummyTokenForMapboxGLJS123';

const fetchShipments = async () => {
  const response = await fetch('http://localhost:8000/api/shipments');
  if (!response.ok) throw new Error('Network error');
  return response.json();
};

export default function ShipmentTracking() {
  const [selectedMbl, setSelectedMbl] = useState(null);
  const [activeTab, setActiveTab] = useState('Route'); // Route, Containers
  
  const { data: shipments, isLoading } = useQuery({
    queryKey: ['shipments'],
    queryFn: fetchShipments,
    refetchInterval: 300000,
  });

  const activeShipment = shipments?.find(s => s.mbl_no === selectedMbl);

  // Mock Route generation for the map
  const routeData = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: [
        [129.0756, 35.1796], // Busan
        [65, 15],            // Midpoint mock
        [9.9937, 53.5511]   // Hamburg
      ]
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 64px)', backgroundColor: '#eef2f6', overflow: 'hidden' }}>
      
      {/* Mapbox Layer (Background) */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={{ longitude: 65, latitude: 20, zoom: 2 }}
          mapStyle="mapbox://styles/mapbox/light-v11"
          attributionControl={false}
        >
          <NavigationControl position="bottom-right" />
          
          {selectedMbl && activeShipment && (
            <>
              <Source id="route" type="geojson" data={routeData}>
                <Layer
                  id="route-line"
                  type="line"
                  paint={{
                    'line-color': '#3b82f6',
                    'line-width': 3,
                    'line-dasharray': [2, 2]
                  }}
                />
              </Source>

              <Marker longitude={129.0756} latitude={35.1796} anchor="center">
                <div style={{ width: '12px', height: '12px', backgroundColor: '#1f2937', borderRadius: '50%', border: '2px solid white', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }} />
              </Marker>
              <Marker longitude={9.9937} latitude={53.5511} anchor="center">
                <div style={{ width: '12px', height: '12px', backgroundColor: '#1f2937', borderRadius: '50%', border: '2px solid white', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }} />
              </Marker>
              <Marker longitude={65} latitude={15} anchor="center">
                <div style={{ backgroundColor: '#2563eb', color: 'white', padding: '6px', borderRadius: '50%', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', border: '2px solid white' }}>
                  <Navigation size={16} style={{ transform: 'rotate(180deg)' }} />
                </div>
              </Marker>
              
              <Popup longitude={65} latitude={15} anchor="top" closeButton={false} style={{ marginTop: '8px', maxWidth: '250px' }}>
                <div style={{ fontSize: '0.875rem', padding: '2px 4px' }}>
                  <p style={{ fontWeight: 'bold', color: '#1f2937', margin: 0 }}>{activeShipment.mbl_no}</p>
                  <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '2px', marginBottom: 0 }}>{activeShipment.pol} &gt; {activeShipment.pod}</p>
                </div>
              </Popup>
            </>
          )}
        </Map>
      </div>

      {/* Left Overlay Panel */}
      <div style={{ position: 'absolute', top: '16px', left: '16px', bottom: '16px', width: '420px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', zIndex: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {!selectedMbl ? (
          // --- List View ---
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', flexShrink: 0 }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <Ship size={20} color="#2563eb" /> 선적 리스트
              </h2>
              <span style={{ backgroundColor: '#dbeafe', color: '#1e40af', fontSize: '0.75rem', fontWeight: 500, padding: '4px 8px', borderRadius: '9999px' }}>
                총 {shipments?.length || 0} 건
              </span>
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1, padding: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <DelayRateWidget shipments={shipments || []} />
              </div>

              <div style={{ paddingTop: '8px', marginTop: '16px' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#374151', marginBottom: '12px' }}>운송 중인 선적</h3>
                {shipments?.map(s => (
                  <div 
                    key={s.mbl_no}
                    onClick={() => setSelectedMbl(s.mbl_no)}
                    style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', marginBottom: '12px', cursor: 'pointer', backgroundColor: 'white', transition: 'all 0.2s' }}
                    onMouseOver={(e) => { e.currentTarget.style.borderColor = '#60a5fa'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 'bold', color: '#111827' }}>{s.mbl_no}</span>
                      <span style={{ fontSize: '0.75rem', backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, border: '1px solid #dbeafe' }}>In transit</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem', color: '#4b5563' }}>
                      <div>
                        <p style={{ fontWeight: 500, color: '#1f2937', margin: 0 }}>{s.pol || 'Busan, KR'}</p>
                        <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>ETD {s.etd ? new Date(s.etd).toLocaleDateString() : '-'}</p>
                      </div>
                      <Navigation size={16} color="#d1d5db" style={{ transform: 'rotate(90deg)' }} />
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontWeight: 500, color: '#1f2937', margin: 0 }}>{s.pod || 'Hamburg, DE'}</p>
                        <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>ETA {s.eta ? new Date(s.eta).toLocaleDateString() : '-'}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {shipments?.length === 0 && (
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', textAlign: 'center', padding: '16px 0' }}>운송 중인 선적 데이터가 없습니다.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          // --- Detail View ---
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
            {/* Header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <button 
                onClick={() => setSelectedMbl(null)}
                style={{ display: 'flex', alignItems: 'center', color: '#2563eb', fontWeight: 600, fontSize: '0.875rem', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
              >
                <ArrowLeft size={16} style={{ marginRight: '4px' }} /> Back
              </button>
            </div>
            
            {/* B/L Info */}
            <div style={{ padding: '20px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ backgroundColor: '#1f2937', color: 'white', fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px' }}>BK</span>
                  <h2 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>{activeShipment.mbl_no}</h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Ship size={12}/> {activeShipment.orders?.length || 0}
                  </span>
                  <span style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #dbeafe', fontSize: '0.75rem', fontWeight: 600, padding: '4px 8px', borderRadius: '4px' }}>In transit</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                <div>
                  <p style={{ fontWeight: 'bold', color: '#111827', fontSize: '1rem', margin: 0 }}>{activeShipment.pol || 'Busan, KR'}</p>
                </div>
                <div>
                  <p style={{ fontWeight: 'bold', color: '#111827', fontSize: '1rem', margin: 0 }}>{activeShipment.pod || 'Hamburg, DE'}</p>
                </div>
              </div>
              
              {/* Progress Line */}
              <div style={{ position: 'relative', width: '100%', height: '4px', backgroundColor: '#e5e7eb', borderRadius: '9999px', margin: '12px 0' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '4px', backgroundColor: '#1f2937', borderRadius: '9999px', width: '45%' }}></div>
                <div style={{ position: 'absolute', top: '50%', left: 0, width: '8px', height: '8px', backgroundColor: '#1f2937', borderRadius: '50%', transform: 'translate(-50%, -50%)' }}></div>
                <div style={{ position: 'absolute', top: '50%', left: '45%', width: '12px', height: '12px', border: '2px solid #1f2937', backgroundColor: 'white', borderRadius: '50%', transform: 'translate(-50%, -50%)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '4px', height: '4px', backgroundColor: '#1f2937', borderRadius: '50%' }}></div>
                </div>
                <div style={{ position: 'absolute', top: '50%', right: 0, width: '8px', height: '8px', backgroundColor: '#d1d5db', borderRadius: '50%', transform: 'translate(50%, -50%)' }}></div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6b7280' }}>
                <p style={{ margin: 0 }}>ATD {activeShipment.etd ? new Date(activeShipment.etd).toLocaleDateString() : '1 Sep 2026'}</p>
                <p style={{ margin: 0 }}>ETA {activeShipment.eta ? new Date(activeShipment.eta).toLocaleDateString() : '13 Oct 2026'}</p>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', padding: '0 16px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
              {['Route', 'Vessel', 'Containers', 'Exceptions'].map(tab => (
                <button
                  key={tab}
                  style={{
                    padding: '12px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    border: 'none',
                    borderBottom: activeTab === tab ? '2px solid #2563eb' : '2px solid transparent',
                    color: activeTab === tab ? '#2563eb' : '#6b7280',
                    background: 'none',
                    cursor: 'pointer',
                    transition: 'colors 0.2s'
                  }}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {activeTab === 'Route' && (
                <div style={{ position: 'relative', paddingLeft: '24px' }}>
                  {/* Vertical line */}
                  <div style={{ position: 'absolute', top: '8px', bottom: '24px', left: '8px', width: '2px', backgroundColor: '#e5e7eb' }}></div>
                  
                  {/* Milestones */}
                  <div style={{ marginBottom: '24px', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '4px', left: '-21px', width: '12px', height: '12px', backgroundColor: 'white', border: '2px solid #1f2937', borderRadius: '50%' }}></div>
                    <h4 style={{ fontWeight: 'bold', color: '#111827', fontSize: '0.875rem', margin: '0 0 8px 0' }}>{activeShipment.pol || 'Busan, KR'}</h4>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <li style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                        <span style={{ color: '#4b5563' }}>Export Empty Container Released</span>
                        <span style={{ color: '#6b7280' }}>25 Aug 2026 11:26</span>
                      </li>
                      <li style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                        <span style={{ color: '#4b5563' }}>Export Truck Gate In to Terminal</span>
                        <span style={{ color: '#6b7280' }}>28 Aug 2026 23:37</span>
                      </li>
                      <li style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                        <span style={{ color: '#4b5563' }}>Vessel Loading at POL</span>
                        <span style={{ color: '#6b7280' }}>30 Aug 2026 19:07</span>
                      </li>
                      <li style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 500, color: '#111827', position: 'relative' }}>
                        <div style={{ position: 'absolute', top: '2px', left: '-22px', width: '14px', height: '14px', backgroundColor: 'white', border: '2px solid #3b82f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                           <div style={{ width: '6px', height: '6px', backgroundColor: '#3b82f6', borderRadius: '50%' }}></div>
                        </div>
                        <span>Vessel Departure from POL</span>
                        <span>1 Sep 2026 06:29</span>
                      </li>
                    </ul>
                  </div>

                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '4px', left: '-21px', width: '12px', height: '12px', backgroundColor: '#e5e7eb', borderRadius: '50%' }}></div>
                    <h4 style={{ fontWeight: 'bold', color: '#111827', fontSize: '0.875rem', margin: '0 0 8px 0' }}>{activeShipment.pod || 'Hamburg, DE'}</h4>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <li style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', opacity: 0.5 }}>
                        <span style={{ color: '#4b5563' }}>Vessel arrival at final POD</span>
                        <span style={{ color: '#6b7280' }}>13 Oct 2026 06:00</span>
                      </li>
                      <li style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', opacity: 0.5 }}>
                        <span style={{ color: '#4b5563' }}>Arrived at delivery location</span>
                        <span style={{ color: '#6b7280' }}>13 Oct 2026 21:55</span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {activeTab === 'Containers' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {activeShipment.orders?.map((o, idx) => (
                    <div key={idx} style={{ backgroundColor: '#f9fafb', padding: '12px', borderRadius: '8px', border: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '0.875rem', color: '#1f2937' }}>{o.product_model?.model_name || 'Unknown'}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 500, backgroundColor: 'white', padding: '2px 8px', borderRadius: '4px', border: '1px solid #e5e7eb' }}>{o.current_status}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6b7280' }}>
                        <span>S/N: {o.serial_number || '-'}</span>
                        <span>P/O: {o.reference_no}</span>
                      </div>
                    </div>
                  ))}
                  {(!activeShipment.orders || activeShipment.orders.length === 0) && (
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', textAlign: 'center', padding: '16px 0', margin: 0 }}>포함된 장비 정보가 없습니다.</p>
                  )}
                </div>
              )}
              
              {(activeTab === 'Vessel' || activeTab === 'Exceptions') && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '128px', color: '#9ca3af', fontSize: '0.875rem' }}>
                  {activeTab} 정보는 준비 중입니다.
                </div>
              )}
            </div>

            {/* Bottom actions */}
            <div style={{ padding: '16px', borderTop: '1px solid #f3f4f6', backgroundColor: '#f9fafb', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#2563eb', backgroundColor: '#eff6ff', padding: '8px 12px', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer' }}>
                <span style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>!</span>
                Wrong shipping line? <span style={{ marginLeft: '8px', textDecoration: 'underline' }}>Change</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', color: '#9ca3af' }}>
                <button style={{ padding: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af' }}><Trash2 size={16}/></button>
                <button style={{ padding: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af' }}><Link size={16}/></button>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
