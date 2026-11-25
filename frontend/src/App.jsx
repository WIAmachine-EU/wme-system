import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import ScrollButtons from './components/ScrollButtons';

// Auth Page
import Login from './pages/Login';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminInventory from './pages/admin/AdminInventory';
import AdminDispatch from './pages/admin/AdminDispatch';
import AdminSalesArchive from './pages/admin/AdminSalesArchive';
import SalesAnalytics from './pages/SalesAnalytics';
import AdminPromotion from './pages/admin/AdminPromotion';
import UploadSettings from './pages/admin/UploadSettings';
import AdminUsers from './pages/admin/AdminUsers';
import AdminShipmentUpload from './pages/admin/AdminShipmentUpload';
import ShipmentTracking from './pages/admin/ShipmentTracking';
import ProductLibrary from './pages/ProductLibrary';
import ErpSyncPanel from './components/ErpSyncPanel';

// Dealer Pages
import DealerDashboard from './pages/dealer/DealerDashboard';
import DealerOrders from './pages/dealer/DealerOrders';
import DealerSalesArchive from './pages/dealer/DealerSalesArchive';
import DealerInventory from './pages/dealer/DealerInventory';
import DealerPromotion from './pages/dealer/DealerPromotion';

// RSM Pages (임시 비활성화: 추후 개선 후 재활성화 예정)
// import RsmDashboard from './pages/rsm/RsmDashboard';

// Common Pages
import UserProfile from './pages/UserProfile';

const INACTIVITY_TIME = 30 * 60 * 1000; // 30 minutes in milliseconds

export default function App() {
  const { i18n } = useTranslation();
  const [authState] = useState(() => {
    try {
      const stored = localStorage.getItem('erp_auth');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Date.now() - parsed.lastActivity < INACTIVITY_TIME) {
          return parsed;
        }
        localStorage.removeItem('erp_auth');
      }
    } catch (e) {
      console.error('Failed to parse auth state');
    }
    return null;
  });

  const [isAuthenticated, setIsAuthenticated] = useState(authState ? true : false);
  const [currentRole, setCurrentRole] = useState(authState?.currentRole || 'SCM_ADMIN');
  const [currentUserId, setCurrentUserId] = useState(authState?.currentUserId || '');
  const [currentUserEmail, setCurrentUserEmail] = useState(authState?.currentUserEmail || '');
  const [dealerCompanyId, setDealerCompanyId] = useState(authState?.dealerCompanyId ?? null);
  const [dealerCompanyName, setDealerCompanyName] = useState(authState?.dealerCompanyName || '');
  const [needsProfileSetup, setNeedsProfileSetup] = useState(authState?.needsProfileSetup || false);
  // Default tabs based on role
  const [activeTab, setActiveTab] = useState(authState?.activeTab || 'admin-dashboard');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  // Sync state to localStorage
  useEffect(() => {
    if (isAuthenticated) {
      localStorage.setItem('erp_auth', JSON.stringify({
        currentRole,
        currentUserId,
        currentUserEmail,
        dealerCompanyId,
        dealerCompanyName,
        needsProfileSetup,
        activeTab,
        lastActivity: Date.now()
      }));
    } else {
      localStorage.removeItem('erp_auth');
    }
  }, [isAuthenticated, currentRole, currentUserId, currentUserEmail, dealerCompanyId, dealerCompanyName, needsProfileSetup, activeTab]);

  // 토큰 만료(401) 감지 시 즉시 세션 초기화 및 로그인 화면 전환
  useEffect(() => {
    const handleAuthExpired = () => {
      setDealerCompanyId(null);
      setDealerCompanyName('');
      setIsAuthenticated(false);
    };
    window.addEventListener('wme-auth-expired', handleAuthExpired);
    return () => window.removeEventListener('wme-auth-expired', handleAuthExpired);
  }, []);

  // 로그인 유지 중(새로고침 포함) 백엔드 DB의 최신 역할 및 소속 딜러사 정보 자동 동기화
  useEffect(() => {
    if (!isAuthenticated) return;
    const token = localStorage.getItem('wme_access_token');
    if (!token) {
      localStorage.removeItem('erp_auth');
      setDealerCompanyId(null);
      setDealerCompanyName('');
      setIsAuthenticated(false);
      return;
    }

    let cancelled = false;
    fetch('/api/v1/users/me')
      .then(res => (res.ok ? res.json() : null))
      .then(me => {
        if (cancelled || !me) return;
        if (me.role) setCurrentRole(me.role);
        if (me.username) setCurrentUserId(me.username);
        if (me.email) setCurrentUserEmail(me.email);
        setDealerCompanyId(me.dealer_company_id ?? null);
        setDealerCompanyName(me.dealer_company?.name || '');
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Handle inactivity auto-logout
  useEffect(() => {
    let intervalId;
    let lastUpdate = Date.now();
    
    const updateActivity = () => {
      const now = Date.now();
      // Throttle localStorage updates to once every 10 seconds
      if (now - lastUpdate < 10000) return;
      lastUpdate = now;

      if (isAuthenticated) {
        const stored = localStorage.getItem('erp_auth');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (now - parsed.lastActivity >= INACTIVITY_TIME) {
              localStorage.removeItem('wme_access_token');
              setIsAuthenticated(false);
              alert('30분 동안 활동이 없어 자동으로 로그아웃 되었습니다.');
              return;
            }
            parsed.lastActivity = now;
            localStorage.setItem('erp_auth', JSON.stringify(parsed));
          } catch (e) {}
        }
      }
    };

    const checkInactivity = () => {
      if (isAuthenticated) {
        const stored = localStorage.getItem('erp_auth');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Date.now() - parsed.lastActivity >= INACTIVITY_TIME) {
              localStorage.removeItem('wme_access_token');
              setIsAuthenticated(false);
              alert('30분 동안 활동이 없어 자동으로 로그아웃 되었습니다.');
            }
          } catch (e) {}
        }
      }
    };

    if (isAuthenticated) {
      window.addEventListener('mousemove', updateActivity);
      window.addEventListener('keydown', updateActivity);
      window.addEventListener('click', updateActivity);
      window.addEventListener('scroll', updateActivity);

      intervalId = setInterval(checkInactivity, 60 * 1000); // Check every 1 minute
    }

    return () => {
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('click', updateActivity);
      window.removeEventListener('scroll', updateActivity);
      if (intervalId) clearInterval(intervalId);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // When role changes, switch to the default tab for that role to prevent blank screens
  useEffect(() => {
    if (activeTab === 'profile') return; // Allow profile tab for all roles

    if (currentRole === 'DEALER') {
      if (!activeTab.startsWith('dealer-')) setActiveTab('dealer-dashboard');
    } else if (currentRole === 'RSM') {
      if (!['admin-inventory', 'admin-promotion', 'admin-dispatch', 'admin-sales-archive', 'admin-tracking', 'admin-library', 'admin-dashboard'].includes(activeTab)) {
        setActiveTab('admin-dashboard');
      }
    } else {
      if (!activeTab.startsWith('admin-') && activeTab !== 'analytics' && activeTab !== 'management') {
        setActiveTab('admin-dashboard');
      }
    }
  }, [currentRole, activeTab]);

  const isMobileView = windowWidth <= 768;
  const isDesktopOptimized = windowWidth >= 1024;

  const handleLogin = (role, userId, profileSetupNeeded = false, email = '', companyId = null, companyName = '') => {
    setCurrentRole(role);
    setCurrentUserId(userId);
    setCurrentUserEmail(email || userId);
    setDealerCompanyId(companyId ?? null);
    setDealerCompanyName(companyName || '');
    setNeedsProfileSetup(Boolean(profileSetupNeeded));
    setIsAuthenticated(true);

    // 관리자, RSM, 딜러 포털 모두 로그인 성공 후 시스템 진입 시 기본적으로 영문(EN) 우선 적용
    i18n.changeLanguage('en');

    if (profileSetupNeeded) {
      setActiveTab('profile');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('wme_access_token');
    localStorage.removeItem('erp_auth');
    setDealerCompanyId(null);
    setDealerCompanyName('');
    setIsAuthenticated(false);
  };

  const handleHomeClick = () => {
    if (currentRole === 'DEALER') setActiveTab('dealer-dashboard');
    else setActiveTab('admin-dashboard');
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app-container">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        currentRole={currentRole}
        currentUserId={currentUserId}
        isMobileOpen={isMobileOpen}
        onClose={() => setIsMobileOpen(false)}
        onProfileClick={() => setActiveTab('profile')}
        onLogout={handleLogout}
      />

      <div className="main-content">
        <Navbar 
          currentRole={currentRole}
          currentUserId={currentUserId}
          isMobileView={isMobileView}
          setCurrentRole={setCurrentRole} 
          onOpenMobileSidebar={() => setIsMobileOpen(true)}
          onLogout={handleLogout}
          onHomeClick={handleHomeClick}
          onProfileClick={() => setActiveTab('profile')}
        />

        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {needsProfileSetup && activeTab !== 'profile' && (
            <div style={{
              margin: '16px 24px 0',
              padding: '12px 16px',
              borderRadius: '10px',
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              color: '#92400E',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
              fontSize: '0.9rem',
              fontWeight: 600
            }}>
              <span>아직 시스템에 표시될 성명(사용자명)이 설정되지 않았습니다. 개인정보 설정에서 성명을 등록해 주세요.</span>
              <button
                onClick={() => setActiveTab('profile')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#D97706',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '0.82rem'
                }}
              >
                개인정보 설정 바로가기
              </button>
            </div>
          )}

          {/* Common Routing */}
          {activeTab === 'profile' && (
            <UserProfile
              currentUserId={currentUserId}
              currentUserEmail={currentUserEmail}
              needsProfileSetup={needsProfileSetup}
              onUpdateProfile={(updatedUser) => {
                if (updatedUser?.username) {
                  setCurrentUserId(updatedUser.username);
                  setNeedsProfileSetup(false);
                }
                if (updatedUser?.email) {
                  setCurrentUserEmail(updatedUser.email);
                }
              }}
              isMobileView={isMobileView}
              onClose={handleHomeClick}
            />
          )}

          {/* RSM Routing (임시 비활성화: 추후 개선 후 재활성화 예정) */}
          {/* {activeTab === 'rsm-dashboard' && currentRole === 'RSM' && <RsmDashboard isMobileView={isMobileView} currentUserId={currentUserId} />} */}

          {/* Admin Routing */}
          {activeTab === 'admin-dashboard' && (currentRole === 'SCM_ADMIN' || currentRole === 'RSM') && <AdminDashboard isMobileView={isMobileView} currentRole={currentRole} />}
          {activeTab === 'admin-inventory' && (currentRole === 'SCM_ADMIN' || currentRole === 'RSM') && <AdminInventory isMobileView={isMobileView} />}
          {activeTab === 'admin-dispatch' && (currentRole === 'SCM_ADMIN' || currentRole === 'RSM') && <AdminDispatch isMobileView={isMobileView} currentRole={currentRole} />}
          {activeTab === 'admin-sales-archive' && (currentRole === 'SCM_ADMIN' || currentRole === 'RSM') && <AdminSalesArchive isMobileView={isMobileView} />}
          {activeTab === 'admin-users' && currentRole !== 'RSM' && <AdminUsers isMobileView={isMobileView} />}
          {activeTab === 'analytics' && currentRole !== 'RSM' && <SalesAnalytics isMobileView={isMobileView} isDesktopOptimized={isDesktopOptimized} />}
          {activeTab === 'admin-promotion' && (currentRole === 'SCM_ADMIN' || currentRole === 'RSM') && <AdminPromotion isMobileView={isMobileView} />}
          {activeTab === 'admin-shipment-upload' && currentRole !== 'RSM' && <AdminShipmentUpload isMobileView={isMobileView} />}
          {activeTab === 'admin-tracking' && (currentRole === 'SCM_ADMIN' || currentRole === 'RSM') && (
            <ShipmentTracking 
              isMobileView={isMobileView} 
              onNavigateUpload={() => setActiveTab('admin-shipment-upload')} 
            />
          )}
          {activeTab === 'management' && currentRole !== 'RSM' && (
            <UploadSettings onOpenErpSync={() => setActiveTab('admin-erp-sync')} />
          )}
          {activeTab === 'admin-erp-sync' && currentRole !== 'RSM' && (
            <ErpSyncPanel baseUrl="/api/erp-sync" />
          )}
          {activeTab === 'admin-library' && (currentRole === 'SCM_ADMIN' || currentRole === 'RSM') && <ProductLibrary currentRole={currentRole} isMobileView={isMobileView} />}

          {/* Dealer Routing */}
          {activeTab === 'dealer-dashboard' && (
            <DealerDashboard
              isMobileView={isMobileView}
              setActiveTab={setActiveTab}
              dealerCompanyId={dealerCompanyId}
              dealerCompanyName={dealerCompanyName}
            />
          )}
          {activeTab === 'dealer-orders' && (
            <DealerOrders
              isMobileView={isMobileView}
              dealerCompanyId={dealerCompanyId}
              dealerCompanyName={dealerCompanyName}
            />
          )}
          {activeTab === 'dealer-sales-archive' && (
            <DealerSalesArchive
              isMobileView={isMobileView}
              dealerCompanyId={dealerCompanyId}
              dealerCompanyName={dealerCompanyName}
            />
          )}
          {activeTab === 'dealer-inventory' && <DealerInventory isMobileView={isMobileView} />}
          {activeTab === 'dealer-promotion' && <DealerPromotion isMobileView={isMobileView} />}
          {activeTab === 'dealer-library' && <ProductLibrary currentRole={currentRole} isMobileView={isMobileView} />}
          
          {['admin-dashboard', 'admin-inventory', 'admin-dispatch', 'admin-promotion', 'admin-users', 'admin-erp-sync', 'dealer-inventory', 'admin-library', 'dealer-library'].includes(activeTab) && (
            <ScrollButtons />
          )}
        </main>
      </div>
    </div>
  );
}
